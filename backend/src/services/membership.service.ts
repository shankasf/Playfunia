import { DateTime } from 'luxon';

import { MembershipRepository, MembershipPlanRepository, UserRepository, CustomerRepository } from '../repositories';
import { AppError } from '../utils/app-error';
import { publishAdminEvent } from './admin-events.service';

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

// Helper to get plan info by tier
async function getPlanByTier(tier: string) {
  const plans = await MembershipPlanRepository.findAll(true);
  const planNames = REVERSE_TIER_MAP[tier] ?? [];
  return plans.find(p => planNames.includes(p.name)) ?? null;
}

export async function listMemberships() {
  // Fetch membership plans from database
  const plans = await MembershipPlanRepository.findAll(true);

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
  const startedAt = DateTime.now();
  const expiresAt = startedAt.plus({ months: input.durationMonths });

  // Create membership record
  const membership = await MembershipRepository.create({
    customer_id: customerId,
    tier,
    start_date: startedAt.toISODate() as string,
    end_date: expiresAt.toISODate() ?? undefined,
    visits_per_month: plan.visits_per_month ?? undefined,
  });

  return {
    membershipId: String(membership.membership_id),
    tierName: plan.name,
    tier,
    startedAt: membership.start_date,
    expiresAt: membership.end_date,
    autoRenew: true,
    visitsPerMonth: plan.visits_per_month,
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
  const visitsPerMonth = plan?.visits_per_month ?? null;

  // Calculate visits remaining based on visits_per_month and visits_used_this_period
  const visitsUsed = membership.visits_used_this_period ?? 0;
  const visitsRemaining = visitsPerMonth !== null ? visitsPerMonth - visitsUsed : null;

  // Decrement visits remaining if applicable
  if (visitsRemaining !== null) {
    if (visitsRemaining <= 0) {
      throw new AppError('Visit limit reached for this membership period', 400);
    }
    
    await MembershipRepository.update(membership.membership_id, {
      visits_used_this_period: visitsUsed + 1,
      last_visit_at: new Date().toISOString(),
    });
  }

  publishAdminEvent('membership.visitRecorded', {
    userId: targetUserId,
    tier: membership.tier,
    visitsRemaining: visitsRemaining !== null ? visitsRemaining - 1 : null,
  });

  return {
    userId: targetUserId,
    membership: {
      tier: membership.tier,
      tierName: plan?.name ?? membership.tier,
      visitsPerMonth,
      visitsRemaining: visitsRemaining !== null ? visitsRemaining - 1 : null,
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
  const visitsPerMonth = plan?.visits_per_month ?? null;
  const visitsUsed = membership.visits_used_this_period ?? 0;
  const visitsRemaining = visitsPerMonth !== null ? visitsPerMonth - visitsUsed : null;

  if (visitsRemaining !== null) {
    if (visitsRemaining <= 0) {
      throw new AppError('Visit limit reached for this membership period', 400);
    }
    
    await MembershipRepository.update(membership.membership_id, {
      visits_used_this_period: visitsUsed + 1,
      last_visit_at: new Date().toISOString(),
    });
  }

  const newVisitsUsed = visitsUsed + 1;
  const newVisitsRemaining = visitsRemaining !== null ? visitsRemaining - 1 : null;
  const now = new Date().toISOString();

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
