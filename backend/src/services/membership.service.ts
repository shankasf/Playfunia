import { DateTime } from 'luxon';

import { MembershipRepository, MembershipPlanRepository, MembershipVisitRepository, UserRepository, CustomerRepository, ChildRepository, ProductPromotionRepository, PromoOfferRepository } from '../repositories';
import { AppError } from '../utils/app-error';
import { logger } from '../utils/logger';
import { supabaseAny } from '../config/supabase';
import { multiplyDollars, calculateTax, addDollars } from '../utils/currency';
import { publishAdminEvent } from './admin-events.service';
import { sendMembershipConfirmation, sendQueuedMembershipConfirmation } from './email.service';
import { sendMembershipConfirmationSms, sendQueuedMembershipConfirmationSms } from './sms.service';
import { createReceiptRecord, generateMembershipReceiptPDF } from './receipt.service';
import { getTaxRate as getCentralizedTaxRate, getTaxRateSync as getCentralizedTaxRateSync, getSingleAdmissionPrice, getExtraAdultAdmissionPrice } from './pricing-config.service';

import type {
  PurchaseMembershipInput,
  RecordMembershipVisitInput,
} from '../schemas/membership.schema';

// Tier name mapping for database plans
const TIER_MAP: Record<string, string> = {
  'Mini Plan': 'mini',
  'Super Plan': 'super',
  'Mega Plan': 'mega',
  // Legacy tier mappings (for existing memberships)
  'Silver': 'explorer',
  'Gold': 'adventurer',
  'Platinum': 'champion',
  'VIP Platinum': 'champion',
  'Promo - 1 Kid + 1 Adult': 'promo_1kid',
  'Promo - 2 Kids + 2 Adults': 'promo_2kids',
  'Promo - 3 Kids + 3 Adults': 'promo_3kids',
};

// Reverse tier map for lookup
const REVERSE_TIER_MAP: Record<string, string[]> = {
  'mini': ['Mini Plan'],
  'super': ['Super Plan'],
  'mega': ['Mega Plan'],
  // Legacy tier mappings (for existing memberships)
  'explorer': ['Silver'],
  'adventurer': ['Gold'],
  'champion': ['Platinum', 'VIP Platinum'],
  'promo_1kid': ['Promo - 1 Kid + 1 Adult'],
  'promo_2kids': ['Promo - 2 Kids + 2 Adults'],
  'promo_3kids': ['Promo - 3 Kids + 3 Adults'],
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
    // Fetch membership plans and active promotions in parallel
    const [plans, activePromos] = await Promise.all([
      MembershipPlanRepository.findAll(true),
      ProductPromotionRepository.findAllActive('membership'),
    ]);

    const duration = Date.now() - startTime;
    if (duration > 500) {
      logger.warn({
        service: 'membership',
        action: 'listMemberships',
        durationMs: duration,
        planCount: plans.length,
      });
    }

    // Exclude promo-specific plans from regular listing (they appear via promo offers)
    const regularPlans = plans.filter(p => !p.name.startsWith('Promo - '));

    return regularPlans.map(plan => {
      // Find promo: first check plan-specific, then type-wide (product_id IS NULL)
      const promo =
        activePromos.find(p => p.product_id === plan.plan_id) ??
        activePromos.find(p => p.product_id === null) ??
        null;

      let effectivePrice = plan.monthly_price;
      if (promo) {
        effectivePrice = promo.discount_type === 'percent'
          ? Math.round(plan.monthly_price * (1 - promo.discount_value / 100) * 100) / 100
          : promo.discount_value;
      }

      return {
        id: String(plan.plan_id),
        name: plan.name,
        tier: TIER_MAP[plan.name] ?? 'explorer',
        description: plan.description,
        monthlyPrice: effectivePrice,
        originalPrice: promo ? plan.monthly_price : undefined,
        promoLabel: promo?.promo_label ?? undefined,
        promoNote: promo?.promo_note ?? undefined,
        promoEndsAt: promo?.ends_at ?? undefined,
        promoSpotsLeft: promo?.max_redemptions != null
          ? Math.max(0, promo.max_redemptions - promo.redemptions)
          : undefined,
        benefits: plan.benefits ?? [],
        maxChildren: plan.max_children ?? 1,
        maxAdults: plan.max_adults ?? plan.max_children ?? 1,
        visitsPerMonth: plan.visits_per_month,
        discountPercent: plan.discount_percent ?? 0,
        guestPassesPerMonth: plan.guest_passes_per_month ?? 0,
        isActive: plan.is_active ?? true,
      };
    });
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

export async function purchaseMembership(
  userId: string,
  input: PurchaseMembershipInput,
  options?: { skipNotifications?: boolean; paymentId?: string; childId?: number },
) {
  const userIdNum = parseInt(userId, 10);
  if (isNaN(userIdNum)) {
    throw new AppError('Invalid user ID', 400);
  }

  const user = await UserRepository.findById(userIdNum);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (!user.first_name || !user.last_name || !user.email || !user.phone) {
    throw new AppError(
      'Account is missing required information (first name, last name, email, phone). Please update your profile before purchasing a membership.',
      400,
    );
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

  // Membership requires a child on file with a verification photo. The optional
  // childId is set by the checkout flow after photo upload; the admin direct
  // purchase route requires the caller to pre-create the child.
  if (options?.childId) {
    const child = await ChildRepository.findById(options.childId);
    if (!child || child.customer_id !== customerId) {
      throw new AppError('Selected child does not belong to this account.', 403);
    }
    if (!child.photo_url || !child.photo_storage_path) {
      throw new AppError(
        'A photo of the child is required for membership check-in verification.',
        400,
      );
    }
  }

  // Find the membership plan from database
  const planId = parseInt(input.membershipId, 10);
  const [plan, promo] = await Promise.all([
    MembershipPlanRepository.findById(planId),
    ProductPromotionRepository.findActive('membership', planId),
  ]);
  if (!plan) {
    throw new AppError('Membership plan not found', 404);
  }

  // Calculate effective price (promo or normal)
  let effectiveMonthlyPrice = plan.monthly_price;
  if (promo) {
    effectiveMonthlyPrice = promo.discount_type === 'percent'
      ? Math.round(plan.monthly_price * (1 - promo.discount_value / 100) * 100) / 100
      : promo.discount_value;
  }

  const tier = TIER_MAP[plan.name] ?? 'explorer';

  // Check if user already has an active/pending membership of the same tier
  const existingMembership = await MembershipRepository.findLatestByCustomerIdAndTier(customerId, tier);

  let startedAt: DateTime;
  let isQueued = false;
  let existingExpiryDate: string | null = null;

  if (existingMembership && existingMembership.end_date) {
    // User already has an active membership of this tier - queue the new one
    const existingEndDate = DateTime.fromISO(existingMembership.end_date).setZone('America/New_York');
    // Start the new membership the day after the existing one ends
    startedAt = existingEndDate.plus({ days: 1 });
    isQueued = true;
    existingExpiryDate = existingEndDate.toLocaleString(DateTime.DATE_FULL);
    console.log(`[MembershipService] Queueing membership for customer ${customerId}, tier ${tier}. Existing ends: ${existingMembership.end_date}, new starts: ${startedAt.toISODate()}`);
  } else {
    // No existing membership - start immediately
    startedAt = DateTime.now().setZone('America/New_York');
  }

  const expiresAt = startedAt.plus({ months: input.durationMonths });

  const autoRenew = input.autoRenew ?? true;

  // Handle referral matching
  let referralName: string | undefined;
  let referralNormalized: string | undefined;
  let referralStatus: string | undefined;
  let matchedStaffUserId: number | undefined;

  if (input.referralName && input.referralName.trim()) {
    referralName = input.referralName.trim();
    referralNormalized = referralName.toLowerCase().trim();

    // Match against staff/employee users
    const { data: staffUsers } = await supabaseAny
      .from('users')
      .select('user_id, first_name, last_name, email')
      .or('roles.cs.{"staff"},roles.cs.{"employee"},roles.cs.{"admin"}');

    const matched = (staffUsers ?? []).find((s: { first_name?: string; last_name?: string }) => {
      const fullName = `${s.first_name ?? ''} ${s.last_name ?? ''}`.toLowerCase().trim();
      const firstName = (s.first_name ?? '').toLowerCase().trim();
      return fullName === referralNormalized || firstName === referralNormalized;
    });

    if (matched) {
      // Block self-referral
      if (matched.user_id === parseInt(userId, 10)) {
        referralStatus = 'unmatched';
        console.log(`[MembershipService] Self-referral blocked for user ${userId}`);
      } else {
        referralStatus = 'matched';
        matchedStaffUserId = matched.user_id;
        console.log(`[MembershipService] Referral matched: "${referralName}" → staff user ${matched.user_id}`);
      }
    } else {
      referralStatus = 'unmatched';
      console.log(`[MembershipService] Referral unmatched: "${referralName}"`);
    }
  }

  // Create membership record with appropriate status
  const membership = await MembershipRepository.create({
    customer_id: customerId,
    tier,
    start_date: startedAt.toISODate() as string,
    end_date: expiresAt.toISODate() ?? undefined,
    visits_per_month: plan.visits_per_month ?? undefined,
    status: isQueued ? 'pending' : 'active',
    auto_renew: autoRenew,
    refund_policy_accepted: input.refundPolicyAccepted ?? false,
    refund_policy_accepted_at: input.refundPolicyAcceptedAt ?? undefined,
    referral_name: referralName,
    referral_normalized: referralNormalized,
    referral_status: referralStatus,
    matched_staff_user_id: matchedStaffUserId,
  });

  // Increment promo redemptions if a promo was applied
  if (promo) {
    try {
      await ProductPromotionRepository.incrementRedemptions(promo.promotion_id);
    } catch (redeemError) {
      console.error('[MembershipService] Failed to increment promo redemptions:', redeemError);
    }
  }

  // Calculate total for receipt with tax from database (cents-based math for precision)
  const taxRate = await getTaxRate();
  const subtotalAmount = multiplyDollars(effectiveMonthlyPrice, input.durationMonths);
  const taxAmount = calculateTax(subtotalAmount, taxRate);
  const totalAmount = addDollars(subtotalAmount, taxAmount);

  // Skip receipt/notification generation when called from checkout flow
  // (checkout flow handles its own receipts and notifications with the real payment ID)
  let receiptNumber: string | undefined;

  if (!options?.skipNotifications) {
    const resolvedPaymentId = options?.paymentId ?? `membership_${membership.membership_id}`;

    // Generate receipt record and PDF
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
        paymentId: resolvedPaymentId,
        metadata: {
          planName: plan.name,
          tier,
          durationMonths: input.durationMonths,
          monthlyPrice: effectiveMonthlyPrice,
          originalMonthlyPrice: promo ? plan.monthly_price : undefined,
          promoLabel: promo?.promo_label ?? undefined,
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
        date: startedAt.setZone('America/New_York').toLocaleString(DateTime.DATE_FULL),
        customerName: `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || 'Customer',
        customerEmail: user.email ?? '',
        planName: plan.name,
        monthlyPrice: effectiveMonthlyPrice,
        durationMonths: input.durationMonths,
        subtotal: subtotalAmount,
        taxAmount,
        taxRate: getTaxRatePercentSync(), // Tax rate as percentage
        total: totalAmount,
        paymentMethod: 'Credit Card',
        paymentId: resolvedPaymentId,
        startDate: startedAt.setZone('America/New_York').toLocaleString(DateTime.DATE_FULL),
        expiryDate: expiresAt.setZone('America/New_York').toLocaleString(DateTime.DATE_FULL),
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

    // Resolve child info for email
    let childName: string | undefined;
    let childBirthDate: string | undefined;
    if (options?.childId) {
      const child = await ChildRepository.findById(options.childId);
      if (child) {
        childName = [child.first_name, child.last_name].filter(Boolean).join(' ');
        childBirthDate = child.birth_date ?? undefined;
      }
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
            queuedStartDate: startedAt.setZone('America/New_York').toLocaleString(DateTime.DATE_FULL),
            queuedExpiryDate: expiresAt.setZone('America/New_York').toLocaleString(DateTime.DATE_FULL),
            currentExpiryDate: existingExpiryDate,
            visitsPerMonth: plan.visits_per_month ?? null,
            guestPassesPerMonth: plan.guest_passes_per_month ?? null,
            discountPercent: plan.discount_percent ?? null,
            benefits: plan.benefits ?? null,
            monthlyPrice: effectiveMonthlyPrice,
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
            parentFullName: `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || 'Customer',
            tierName: plan.name,
            displayId: membership.display_id ?? undefined,
            startDate: startedAt.setZone('America/New_York').toLocaleString(DateTime.DATE_FULL),
            expiryDate: expiresAt.setZone('America/New_York').toLocaleString(DateTime.DATE_FULL),
            visitsPerMonth: plan.visits_per_month ?? null,
            guestPassesPerMonth: plan.guest_passes_per_month ?? null,
            discountPercent: plan.discount_percent ?? null,
            benefits: plan.benefits ?? null,
            autoRenew,
            monthlyPrice: effectiveMonthlyPrice,
            durationMonths: input.durationMonths,
            subtotal: subtotalAmount,
            taxAmount,
            taxRate: getTaxRatePercentSync(), // Tax rate as percentage
            total: totalAmount,
            receiptPdf,
            receiptNumber,
            childName,
            childBirthDate,
            maxChildren: plan.max_children ?? 1,
            maxAdults: plan.max_adults ?? plan.max_children ?? 1,
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
            queuedStartDate: startedAt.setZone('America/New_York').toLocaleString(DateTime.DATE_FULL),
            currentExpiryDate: existingExpiryDate,
            monthlyPrice: effectiveMonthlyPrice,
          });
        } else {
          // Send regular membership SMS
          await sendMembershipConfirmationSms({
            phone: user.phone,
            customerName: user.first_name ?? 'Customer',
            tierName: plan.name,
            startDate: startedAt.setZone('America/New_York').toLocaleString(DateTime.DATE_FULL),
            expiryDate: expiresAt.setZone('America/New_York').toLocaleString(DateTime.DATE_FULL),
            visitsPerMonth: plan.visits_per_month ?? null,
            monthlyPrice: effectiveMonthlyPrice,
            membershipId: membership.display_id ?? membership.membership_id,
          });
        }
      } catch (smsError) {
        console.error('Failed to send membership confirmation SMS:', smsError);
        // Don't fail the purchase if SMS fails
      }
    }
  }

  return {
    membershipId: String(membership.membership_id),
    displayId: membership.display_id,
    tierName: plan.name,
    tier,
    startedAt: membership.start_date,
    expiresAt: membership.end_date,
    autoRenew,
    visitsPerMonth: plan.visits_per_month,
    maxChildren: plan.max_children ?? 1,
    maxAdults: plan.max_adults ?? plan.max_children ?? 1,
    receiptNumber,
    isQueued,
    status: isQueued ? 'pending' : 'active',
    referralStatus: referralStatus ?? null,
  };
}

export async function listPromoOffers() {
  try {
    return await PromoOfferRepository.findActive();
  } catch (error) {
    logger.error({ service: 'membership', action: 'listPromoOffers', error });
    throw error;
  }
}

export async function listMembershipStatuses() {
  const memberships = await MembershipRepository.findActive();
  const plans = await MembershipPlanRepository.findAll(true);

  // Fetch all children for the customers attached to these memberships in a single
  // pass so the staff check-in view can render names + verification photos.
  const customerIds = Array.from(
    new Set(memberships.map(m => m.customer_id).filter((id): id is number => typeof id === 'number')),
  );
  const childrenByCustomer = new Map<number, Array<{
    id: number;
    firstName: string;
    lastName: string | null;
    birthDate: string | null;
    photoUrl: string | null;
  }>>();
  await Promise.all(
    customerIds.map(async cid => {
      const list = await ChildRepository.findByCustomerId(cid);
      childrenByCustomer.set(
        cid,
        list.map(c => ({
          id: c.child_id,
          firstName: c.first_name,
          lastName: c.last_name ?? null,
          birthDate: c.birth_date ?? null,
          photoUrl: c.photo_url ?? null,
        })),
      );
    }),
  );

  return memberships.map(m => {
    const customer = (m as unknown as { customers?: { full_name?: string; email?: string; phone?: string } }).customers;
    const planNames = REVERSE_TIER_MAP[m.tier] ?? [];
    const plan = plans.find(p => planNames.includes(p.name));

    // Calculate remaining visits
    const visitsPerMonth = m.visits_per_month ?? plan?.visits_per_month ?? null;
    const visitsUsed = m.visits_used_this_period ?? 0;
    const visitsRemaining = visitsPerMonth !== null ? visitsPerMonth - visitsUsed : null;

    // Calculate remaining days
    let remainingDays: number | null = null;
    if (m.end_date && m.status === 'active') {
      const endDt = DateTime.fromISO(m.end_date).setZone('America/New_York');
      const nowDt = DateTime.now().setZone('America/New_York').startOf('day');
      remainingDays = Math.max(0, Math.ceil(endDt.diff(nowDt, 'days').days));
    }

    return {
      membershipId: String(m.membership_id),
      displayId: m.display_id ?? null,
      customerId: m.customer_id,
      customerName: customer?.full_name,
      customerEmail: customer?.email,
      customerPhone: customer?.phone ?? null,
      children: childrenByCustomer.get(m.customer_id) ?? [],
      membership: {
        tier: m.tier,
        tierName: plan?.name ?? m.tier,
        status: m.status,
        startDate: m.start_date,
        endDate: m.end_date,
        visitsRemaining,
        visitsPerMonth,
        remainingDays,
        maxChildren: plan?.max_children ?? 1,
        maxAdults: plan?.max_adults ?? plan?.max_children ?? 1,
        autoRenew: m.auto_renew ?? false,
        referralName: m.referral_name ?? null,
        referralStatus: m.referral_status ?? null,
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
 * Record a membership visit by membership ID (for admin/staff use)
 * Enhanced with capacity enforcement and visit logging
 */
export async function recordMembershipVisitByMembershipId(
  membershipId: number,
  checkInData?: { childrenCount?: number; adultsCount?: number; notes?: string; staffUserId?: number },
): Promise<{
  membershipId: number;
  membership: {
    membershipId: string;
    displayId: string | null;
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
    maxChildren: number;
    maxAdults: number;
    extraChildren: number;
    extraAdults: number;
    extraCharge: number;
  };
}> {
  const membership = await MembershipRepository.findById(membershipId);
  if (!membership) {
    throw new AppError('Membership not found', 404);
  }

  if (membership.status !== 'active') {
    throw new AppError('Membership is not active. Status: ' + membership.status, 400);
  }

  // Check if membership is expired (end_date passed and no grace period)
  if (membership.end_date) {
    const endDt = DateTime.fromISO(membership.end_date).setZone('America/New_York').endOf('day');
    const now = DateTime.now().setZone('America/New_York');
    if (now > endDt && !membership.grace_period_end) {
      throw new AppError('Membership has expired', 400);
    }
  }

  const plan = await getPlanByTier(membership.tier);
  const visitsPerMonth = membership.visits_per_month ?? plan?.visits_per_month ?? null;
  const visitsUsed = membership.visits_used_this_period ?? 0;
  const visitsRemaining = visitsPerMonth !== null ? visitsPerMonth - visitsUsed : null;

  if (visitsRemaining !== null && visitsRemaining <= 0) {
    throw new AppError('Visit limit reached for this membership period', 400);
  }

  // Calculate capacity and extra charges
  const maxChildren = plan?.max_children ?? 1;
  const maxAdults = plan?.max_adults ?? maxChildren;
  const childrenCount = checkInData?.childrenCount ?? 0;
  const adultsCount = checkInData?.adultsCount ?? 0;
  const extraChildren = Math.max(0, childrenCount - maxChildren);
  const extraAdults = Math.max(0, adultsCount - maxAdults);

  // Calculate extra charges from database pricing (single source of truth)
  const [extraChildFee, extraAdultFee] = await Promise.all([
    getSingleAdmissionPrice(),      // child entry fee from pricing_config
    getExtraAdultAdmissionPrice(),   // adult entry fee from pricing_config
  ]);
  const extraCharge = (extraChildren * extraChildFee) + (extraAdults * extraAdultFee);

  // Use atomic update to prevent race conditions
  const updatedMembership = await MembershipRepository.recordVisitAtomic(
    membership.membership_id,
    visitsPerMonth
  );

  if (!updatedMembership && visitsPerMonth !== null) {
    throw new AppError('Visit limit reached for this membership period', 400);
  }

  // Set first_used_at on first check-in (for refund eligibility tracking)
  if (!membership.first_used_at) {
    await MembershipRepository.update(membership.membership_id, {
      first_used_at: new Date().toISOString(),
    });
  }

  // Log the visit to membership_visits table (non-blocking: don't fail check-in if logging fails)
  try {
    await MembershipVisitRepository.create({
      membership_id: membership.membership_id,
      children_count: childrenCount,
      adults_count: adultsCount,
      extra_children: extraChildren,
      extra_adults: extraAdults,
      extra_charge: extraCharge,
      checked_in_by: checkInData?.staffUserId,
      notes: checkInData?.notes,
    });
  } catch (visitLogError) {
    logger.error({ err: visitLogError, membershipId: membership.membership_id }, 'Failed to log membership visit');
  }

  const newVisitsUsed = updatedMembership?.visits_used_this_period ?? visitsUsed + 1;
  const newVisitsRemaining = visitsPerMonth !== null ? visitsPerMonth - newVisitsUsed : null;
  const now = updatedMembership?.last_visit_at ?? new Date().toISOString();

  publishAdminEvent('membership.visitRecorded', {
    membershipId,
    tier: membership.tier,
    visitsRemaining: newVisitsRemaining,
    extraCharge,
  });

  return {
    membershipId,
    membership: {
      membershipId: String(membership.membership_id),
      displayId: membership.display_id ?? null,
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
      maxChildren,
      maxAdults,
      extraChildren,
      extraAdults,
      extraCharge,
    },
  };
}

/**
 * Look up a membership by display ID for staff check-in. Returns the
 * customer, plan, expiration state, and the children (with photos) attached
 * to the customer so the front desk can confirm identity at the door.
 */
export async function lookupMembershipForCheckIn(displayId: string) {
  const membership = await MembershipRepository.findByDisplayId(displayId.trim());
  if (!membership) {
    throw new AppError('Membership not found for that ID.', 404);
  }

  const plan = await getPlanByTier(membership.tier);
  const customer = (membership as unknown as { customers?: { full_name?: string; email?: string; phone?: string } }).customers;
  const children = membership.customer_id
    ? await ChildRepository.findByCustomerId(membership.customer_id)
    : [];

  let remainingDays: number | null = null;
  if (membership.end_date && membership.status === 'active') {
    const endDt = DateTime.fromISO(membership.end_date).setZone('America/New_York');
    const nowDt = DateTime.now().setZone('America/New_York').startOf('day');
    remainingDays = Math.max(0, Math.ceil(endDt.diff(nowDt, 'days').days));
  }

  const visitsPerMonth = membership.visits_per_month ?? plan?.visits_per_month ?? null;
  const visitsUsed = membership.visits_used_this_period ?? 0;
  const visitsRemaining = visitsPerMonth !== null ? visitsPerMonth - visitsUsed : null;

  return {
    membershipId: String(membership.membership_id),
    displayId: membership.display_id ?? null,
    status: membership.status,
    tier: membership.tier,
    tierName: plan?.name ?? membership.tier,
    startDate: membership.start_date,
    endDate: membership.end_date,
    remainingDays,
    visitsPerMonth,
    visitsUsed,
    visitsRemaining,
    maxChildren: plan?.max_children ?? 1,
    maxAdults: plan?.max_adults ?? plan?.max_children ?? 1,
    customer: {
      customerId: membership.customer_id,
      name: customer?.full_name ?? null,
      email: customer?.email ?? null,
      phone: customer?.phone ?? null,
    },
    children: children.map(c => ({
      id: c.child_id,
      firstName: c.first_name,
      lastName: c.last_name ?? null,
      birthDate: c.birth_date ?? null,
      photoUrl: c.photo_url ?? null,
    })),
  };
}

/**
 * Get full membership details for a user (for account page)
 */
export async function getMembershipDetails(userId: string) {
  const userIdNum = parseInt(userId, 10);
  if (isNaN(userIdNum)) throw new AppError('Invalid user ID', 400);

  const user = await UserRepository.findById(userIdNum);
  if (!user?.customer_id) return null;

  const membership = await MembershipRepository.findByCustomerId(user.customer_id);
  if (!membership) return null;

  const plan = await getPlanByTier(membership.tier);
  const visitsPerMonth = membership.visits_per_month ?? plan?.visits_per_month ?? null;
  const visitsUsed = membership.visits_used_this_period ?? 0;
  const visitsRemaining = visitsPerMonth !== null ? visitsPerMonth - visitsUsed : null;

  // Calculate remaining days in NY timezone
  let remainingDays: number | null = null;
  if (membership.end_date && membership.status === 'active') {
    const endDt = DateTime.fromISO(membership.end_date).setZone('America/New_York');
    const nowDt = DateTime.now().setZone('America/New_York').startOf('day');
    remainingDays = Math.max(0, Math.ceil(endDt.diff(nowDt, 'days').days));
  }

  // Get total visit count and children for this customer
  const [totalVisits, children] = await Promise.all([
    MembershipVisitRepository.countByMembershipId(membership.membership_id),
    ChildRepository.findByCustomerId(user.customer_id),
  ]);

  // Format dates in NY timezone
  const startDateET = membership.start_date
    ? DateTime.fromISO(membership.start_date).setZone('America/New_York').toLocaleString(DateTime.DATE_FULL)
    : null;
  const endDateET = membership.end_date
    ? DateTime.fromISO(membership.end_date).setZone('America/New_York').toLocaleString(DateTime.DATE_FULL)
    : null;

  return {
    membershipId: String(membership.membership_id),
    displayId: membership.display_id,
    tier: membership.tier,
    tierName: plan?.name ?? membership.tier,
    status: membership.status,
    startDate: startDateET,
    endDate: endDateET,
    startDateRaw: membership.start_date,
    endDateRaw: membership.end_date,
    remainingDays,
    autoRenew: membership.auto_renew ?? false,
    visitsPerMonth,
    visitsUsed,
    visitsRemaining,
    totalVisits,
    maxChildren: plan?.max_children ?? 1,
    maxAdults: plan?.max_adults ?? plan?.max_children ?? 1,
    discountPercent: plan?.discount_percent ?? 0,
    guestPassesPerMonth: plan?.guest_passes_per_month ?? 0,
    benefits: plan?.benefits ?? [],
    referralName: membership.referral_name ?? null,
    referralStatus: membership.referral_status ?? null,
    children: children.map(c => ({
      id: c.child_id,
      firstName: c.first_name,
      lastName: c.last_name,
      birthDate: c.birth_date,
      photoUrl: c.photo_url,
    })),
  };
}
