import { DateTime } from 'luxon';

import { MembershipRepository, MembershipPlanRepository, UserRepository, CustomerRepository } from '../repositories';
import { AppError } from '../utils/app-error';
import { logger } from '../utils/logger';
import { publishAdminEvent } from './admin-events.service';
import { sendMembershipConfirmation, sendQueuedMembershipConfirmation } from './email.service';
import { sendMembershipConfirmationSms, sendQueuedMembershipConfirmationSms } from './sms.service';
import { createReceiptRecord, generateMembershipReceiptPDF } from './receipt.service';
import { getTaxRate as getCentralizedTaxRate, getTaxRateSync as getCentralizedTaxRateSync } from './pricing-config.service';

import type {
  PurchaseMembershipInput,
  RecordMembershipVisitInput,
} from '../schemas/membership.schema';

// Tier name mapping for database plans
const TIER_MAP: Record<string, string> = {
  'Silver': 'explorer',
  'Gold': 'adventurer',
  'Platinum': 'champion',
  'VIP Platinum': 'champion',
};

// Reverse tier map for lookup
const REVERSE_TIER_MAP: Record<string, string[]> = {
  'explorer': ['Silver'],
  'adventurer': ['Gold'],
  'champion': ['Platinum', 'VIP Platinum'],
};

// Use centralized pricing-config.service for tax rates (single source of truth)
const getTaxRate = getCentralizedTaxRate;
const getTaxRateSync = getCentralizedTaxRateSync;

function getTaxRatePercentSync(): number {
  return getCentralizedTaxRateSync() * 100;
}

// Helper to get plan info by tier
async function getPlanByTier(tier: string) {
  const plans = await MembershipPlanRepository.findAll(true);
  const planNames = REVERSE_TIER_MAP[tier] ?? [];
  return plans.find(p => planNames.includes(p.name)) ?? null;
}

export async function listMemberships() {
  const startTime = Date.now();
  try {
    // Fetch membership plans from database
    const plans = await MembershipPlanRepository.findAll(true);

    const duration = Date.now() - startTime;
    if (duration > 500) {
      // Log slow requests
      logger.warn({
        service: 'membership',
        action: 'listMemberships',
        durationMs: duration,
        planCount: plans.length,
      });
    }

    return plans.map(plan => ({
      id: String(plan.plan_id),
      name: plan.name,
      tier: TIER_MAP[plan.name] ?? 'explorer',
      description: plan.description,
      monthlyPrice: plan.monthly_price,
      benefits: plan.benefits ?? [],
      maxChildren: plan.max_children ?? 1,
      visitsPerMonth: plan.visits_per_month,
      discountPercent: plan.discount_percent ?? 0,
      guestPassesPerMonth: plan.guest_passes_per_month ?? 0,
      isActive: plan.is_active ?? true,
    }));
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = error as Error & { code?: string; details?: string; hint?: string };
    logger.error({
      service: 'membership',
      action: 'listMemberships',
      status: 'error',
      durationMs: duration,
      error: {
        message: dbError.message,
        code: dbError.code,
        details: dbError.details,
        hint: dbError.hint,
        stack: dbError.stack,
      },
    });
    throw error;
  }
}

export async function purchaseMembership(userId: string, input: PurchaseMembershipInput) {
  const userIdNum = parseInt(userId, 10);
  if (isNaN(userIdNum)) {
    throw new AppError('Invalid user ID', 400);
  }

  const user = await UserRepository.findById(userIdNum);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Create customer record if it doesn't exist
  let customerId = user.customer_id;
  if (!customerId) {
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Customer';
    const newCustomer = await CustomerRepository.create({
      full_name: fullName,
      email: user.email,
      phone: user.phone ?? undefined,
    });
    customerId = newCustomer.customer_id;

    // Update user with customer_id
    await UserRepository.update(userIdNum, { customer_id: customerId });
  }

  // Find the membership plan from database
  const planId = parseInt(input.membershipId, 10);
  const plan = await MembershipPlanRepository.findById(planId);
  if (!plan) {
    throw new AppError('Membership plan not found', 404);
  }

  const tier = TIER_MAP[plan.name] ?? 'explorer';

  // Check if user already has an active/pending membership of the same tier
  const existingMembership = await MembershipRepository.findLatestByCustomerIdAndTier(customerId, tier);

  let startedAt: DateTime;
  let isQueued = false;
  let existingExpiryDate: string | null = null;

  if (existingMembership && existingMembership.end_date) {
    // User already has an active membership of this tier - queue the new one
    const existingEndDate = DateTime.fromISO(existingMembership.end_date);
    // Start the new membership the day after the existing one ends
    startedAt = existingEndDate.plus({ days: 1 });
    isQueued = true;
    existingExpiryDate = existingEndDate.toLocaleString(DateTime.DATE_FULL);
    console.log(`[MembershipService] Queueing membership for customer ${customerId}, tier ${tier}. Existing ends: ${existingMembership.end_date}, new starts: ${startedAt.toISODate()}`);
  } else {
    // No existing membership - start immediately
    startedAt = DateTime.now();
  }

  const expiresAt = startedAt.plus({ months: input.durationMonths });

  // Create membership record with appropriate status
  const membership = await MembershipRepository.create({
    customer_id: customerId,
    tier,
    start_date: startedAt.toISODate() as string,
    end_date: expiresAt.toISODate() ?? undefined,
    visits_per_month: plan.visits_per_month ?? undefined,
    status: isQueued ? 'pending' : 'active',
  });

  // Calculate total for receipt with tax from database
  const taxRate = await getTaxRate();
  const subtotalAmount = plan.monthly_price * input.durationMonths;
  const taxAmount = Math.round(subtotalAmount * taxRate * 100) / 100;
  const totalAmount = Math.round((subtotalAmount + taxAmount) * 100) / 100;

  // Generate receipt record and PDF
  let receiptNumber: string | undefined;
  let receiptPdf: Buffer | undefined;

  try {
    console.log('[MembershipService] Creating receipt record for membership:', membership.membership_id);
    const receiptResult = await createReceiptRecord({
      purchaseType: 'membership',
      referenceId: membership.membership_id,
      customerId,
      subtotal: subtotalAmount,
      discount: 0,
      tax: taxAmount,
      total: totalAmount,
      paymentMethod: 'Credit Card',
      paymentId: `membership_${membership.membership_id}`,
      metadata: {
        planName: plan.name,
        tier,
        durationMonths: input.durationMonths,
        monthlyPrice: plan.monthly_price,
        startDate: startedAt.toISODate(),
        expiryDate: expiresAt.toISODate(),
      },
    });
    receiptNumber = receiptResult.receiptNumber;
    console.log('[MembershipService] Receipt record created:', receiptNumber);

    // Generate PDF
    console.log('[MembershipService] Generating PDF for receipt:', receiptNumber);
    receiptPdf = await generateMembershipReceiptPDF({
      receiptNumber,
      date: startedAt.toLocaleString(DateTime.DATE_FULL),
      customerName: `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || 'Customer',
      customerEmail: user.email ?? '',
      planName: plan.name,
      monthlyPrice: plan.monthly_price,
      durationMonths: input.durationMonths,
      subtotal: subtotalAmount,
      taxAmount,
      taxRate: getTaxRatePercentSync(), // Tax rate as percentage
      total: totalAmount,
      paymentMethod: 'Credit Card',
      paymentId: `membership_${membership.membership_id}`,
      startDate: startedAt.toLocaleString(DateTime.DATE_FULL),
      expiryDate: expiresAt.toLocaleString(DateTime.DATE_FULL),
      benefits: plan.benefits ?? undefined,
    });
    console.log('[MembershipService] PDF generated, size:', receiptPdf.length, 'bytes');
  } catch (receiptError) {
    // Log full error details for debugging
    const err = receiptError as Error & { code?: string; details?: string; hint?: string };
    console.error('[MembershipService] Failed to generate membership receipt:', {
      message: err.message,
      code: err.code,
      details: err.details,
      hint: err.hint,
      stack: err.stack,
    });
    // Don't fail the purchase if receipt generation fails
  }

  // Send membership confirmation email (different email for queued vs active)
  if (user.email) {
    try {
      if (isQueued && existingExpiryDate) {
        // Send queued membership notification
        await sendQueuedMembershipConfirmation({
          email: user.email,
          customerName: user.first_name ?? 'Customer',
          tierName: plan.name,
          queuedStartDate: startedAt.toLocaleString(DateTime.DATE_FULL),
          queuedExpiryDate: expiresAt.toLocaleString(DateTime.DATE_FULL),
          currentExpiryDate: existingExpiryDate,
          visitsPerMonth: plan.visits_per_month ?? null,
          guestPassesPerMonth: plan.guest_passes_per_month ?? null,
          discountPercent: plan.discount_percent ?? null,
          benefits: plan.benefits ?? null,
          monthlyPrice: plan.monthly_price,
          durationMonths: input.durationMonths,
          subtotal: subtotalAmount,
          taxAmount,
          taxRate: getTaxRatePercentSync(), // Tax rate as percentage
          total: totalAmount,
          receiptPdf,
          receiptNumber,
        });
      } else {
        // Send regular membership confirmation
        await sendMembershipConfirmation({
          email: user.email,
          customerName: user.first_name ?? 'Customer',
          tierName: plan.name,
          startDate: startedAt.toLocaleString(DateTime.DATE_FULL),
          expiryDate: expiresAt.toLocaleString(DateTime.DATE_FULL),
          visitsPerMonth: plan.visits_per_month ?? null,
          guestPassesPerMonth: plan.guest_passes_per_month ?? null,
          discountPercent: plan.discount_percent ?? null,
          benefits: plan.benefits ?? null,
          autoRenew: true,
          monthlyPrice: plan.monthly_price,
          durationMonths: input.durationMonths,
          subtotal: subtotalAmount,
          taxAmount,
          taxRate: getTaxRatePercentSync(), // Tax rate as percentage
          total: totalAmount,
          receiptPdf,
          receiptNumber,
        });
      }
    } catch (emailError) {
      console.error('Failed to send membership confirmation email:', emailError);
      // Don't fail the purchase if email fails
    }
  }

  // Send membership confirmation SMS (different SMS for queued vs active)
  if (user.phone) {
    try {
      if (isQueued && existingExpiryDate) {
        // Send queued membership SMS
        await sendQueuedMembershipConfirmationSms({
          phone: user.phone,
          customerName: user.first_name ?? 'Customer',
          tierName: plan.name,
          queuedStartDate: startedAt.toLocaleString(DateTime.DATE_FULL),
          currentExpiryDate: existingExpiryDate,
          monthlyPrice: plan.monthly_price,
        });
      } else {
        // Send regular membership SMS
        await sendMembershipConfirmationSms({
          phone: user.phone,
          customerName: user.first_name ?? 'Customer',
          tierName: plan.name,
          startDate: startedAt.toLocaleString(DateTime.DATE_FULL),
          expiryDate: expiresAt.toLocaleString(DateTime.DATE_FULL),
          visitsPerMonth: plan.visits_per_month ?? null,
          monthlyPrice: plan.monthly_price,
        });
      }
    } catch (smsError) {
      console.error('Failed to send membership confirmation SMS:', smsError);
      // Don't fail the purchase if SMS fails
    }
  }

  return {
    membershipId: String(membership.membership_id),
    tierName: plan.name,
    tier,
    startedAt: membership.start_date,
    expiresAt: membership.end_date,
    autoRenew: true,
    visitsPerMonth: plan.visits_per_month,
    receiptNumber,
    isQueued,
    status: isQueued ? 'pending' : 'active',
  };
}

export async function listMembershipStatuses() {
  const memberships = await MembershipRepository.findActive();
  const plans = await MembershipPlanRepository.findAll(true);

  return memberships.map(m => {
    const customer = (m as unknown as { customers?: { full_name?: string; email?: string } }).customers;
    const planNames = REVERSE_TIER_MAP[m.tier] ?? [];
    const plan = plans.find(p => planNames.includes(p.name));

    // Calculate remaining visits
    const visitsPerMonth = m.visits_per_month ?? plan?.visits_per_month ?? null;
    const visitsUsed = m.visits_used_this_period ?? 0;
    const visitsRemaining = visitsPerMonth !== null ? visitsPerMonth - visitsUsed : null;

    return {
      membershipId: String(m.membership_id),
      customerId: m.customer_id,
      customerName: customer?.full_name,
      customerEmail: customer?.email,
      membership: {
        tier: m.tier,
        tierName: plan?.name ?? m.tier,
        status: m.status,
        startDate: m.start_date,
        endDate: m.end_date,
        visitsRemaining,
        visitsPerMonth,
      },
    };
  });
}

export async function recordMembershipVisit(
  targetUserId: string,
  _input: RecordMembershipVisitInput = {},
) {
  const userIdNum = parseInt(targetUserId, 10);
  if (isNaN(userIdNum)) {
    throw new AppError('Invalid user ID', 400);
  }

  const user = await UserRepository.findById(userIdNum);
  if (!user?.customer_id) {
    throw new AppError('User not found', 404);
  }

  const membership = await MembershipRepository.findByCustomerId(user.customer_id);
  if (!membership) {
    throw new AppError('Membership not found for this user', 404);
  }

  const plan = await getPlanByTier(membership.tier);
  // Use membership's stored visits_per_month first, then fall back to plan
  const visitsPerMonth = membership.visits_per_month ?? plan?.visits_per_month ?? null;

  // Calculate visits remaining based on visits_per_month and visits_used_this_period
  const visitsUsed = membership.visits_used_this_period ?? 0;
  const visitsRemaining = visitsPerMonth !== null ? visitsPerMonth - visitsUsed : null;

  // Decrement visits remaining if applicable
  if (visitsRemaining !== null && visitsRemaining <= 0) {
    throw new AppError('Visit limit reached for this membership period', 400);
  }

  // Use atomic update to prevent race conditions
  const updatedMembership = await MembershipRepository.recordVisitAtomic(
    membership.membership_id,
    visitsPerMonth
  );

  if (!updatedMembership && visitsPerMonth !== null) {
    throw new AppError('Visit limit reached for this membership period', 400);
  }

  const newVisitsUsed = updatedMembership?.visits_used_this_period ?? visitsUsed + 1;
  const newVisitsRemaining = visitsPerMonth !== null ? visitsPerMonth - newVisitsUsed : null;

  publishAdminEvent('membership.visitRecorded', {
    userId: targetUserId,
    tier: membership.tier,
    visitsRemaining: newVisitsRemaining,
  });

  return {
    userId: targetUserId,
    membership: {
      tier: membership.tier,
      tierName: plan?.name ?? membership.tier,
      visitsPerMonth,
      visitsRemaining: newVisitsRemaining,
    },
  };
}

/**
 * Record a membership visit by customer ID (for admin use)
 */
export async function recordMembershipVisitByMembershipId(membershipId: number): Promise<{
  membershipId: number;
  membership: {
    membershipId: string;
    tier: string;
    tierName: string;
    autoRenew: boolean;
    visitsPerMonth: number | null;
    visitsUsed: number;
    visitsRemaining: number | null;
    visitPeriodStart: string | null;
    lastVisitAt: string;
    discountPercent: number;
    guestPassesPerMonth: number;
  };
}> {
  const membership = await MembershipRepository.findById(membershipId);
  if (!membership) {
    throw new AppError('Membership not found', 404);
  }

  if (membership.status !== 'active') {
    throw new AppError('Membership is not active', 400);
  }

  const plan = await getPlanByTier(membership.tier);
  // Use membership's stored visits_per_month first, then fall back to plan
  const visitsPerMonth = membership.visits_per_month ?? plan?.visits_per_month ?? null;
  const visitsUsed = membership.visits_used_this_period ?? 0;
  const visitsRemaining = visitsPerMonth !== null ? visitsPerMonth - visitsUsed : null;

  if (visitsRemaining !== null && visitsRemaining <= 0) {
    throw new AppError('Visit limit reached for this membership period', 400);
  }

  // Use atomic update to prevent race conditions
  const updatedMembership = await MembershipRepository.recordVisitAtomic(
    membership.membership_id,
    visitsPerMonth
  );

  if (!updatedMembership && visitsPerMonth !== null) {
    throw new AppError('Visit limit reached for this membership period', 400);
  }

  const newVisitsUsed = updatedMembership?.visits_used_this_period ?? visitsUsed + 1;
  const newVisitsRemaining = visitsPerMonth !== null ? visitsPerMonth - newVisitsUsed : null;
  const now = updatedMembership?.last_visit_at ?? new Date().toISOString();

  publishAdminEvent('membership.visitRecorded', {
    membershipId,
    tier: membership.tier,
    visitsRemaining: newVisitsRemaining,
  });

  return {
    membershipId,
    membership: {
      membershipId: String(membership.membership_id),
      tier: membership.tier,
      tierName: plan?.name ?? membership.tier,
      autoRenew: membership.auto_renew ?? false,
      visitsPerMonth,
      visitsUsed: newVisitsUsed,
      visitsRemaining: newVisitsRemaining,
      visitPeriodStart: membership.visit_period_start ?? null,
      lastVisitAt: now,
      discountPercent: plan?.discount_percent ?? 0,
      guestPassesPerMonth: plan?.guest_passes_per_month ?? 0,
    },
  };
}
