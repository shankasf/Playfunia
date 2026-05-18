import { apiGet, apiPatch, apiPost } from './client';

export type MembershipPlanDto = {
  id: string;
  name: string;
  description?: string;
  monthlyPrice: number;
  originalPrice?: number;
  promoLabel?: string;
  promoNote?: string;
  promoEndsAt?: string;
  promoSpotsLeft?: number;
  benefits: string[];
  maxChildren: number;
  maxAdults?: number;
  visitsPerMonth?: number;
  discountPercent?: number;
  guestPassesPerMonth?: number;
};

export type PurchaseMembershipResponse = {
  membership: {
    membershipId: string;
    tierName: string;
    startedAt: string;
    expiresAt: string;
    autoRenew: boolean;
    visitsPerMonth: number | null;
  };
};

export async function fetchMembershipPlans() {
  const response = await apiGet<{ memberships: MembershipPlanDto[] }>('/memberships');
  return response.memberships;
}

export type PromoOfferPlanDto = {
  name: string;
  normalValue: number;
  regularPrice: number;
  promoPrice: number;
  savingsPercent: number;
  planId?: number;
};

export type PromoOfferDto = {
  offer_id: number;
  title: string;
  subtitle: string | null;
  promo_label: string | null;
  promo_note: string | null;
  notes: string[];
  plans: PromoOfferPlanDto[];
  starts_at: string;
  ends_at: string;
  max_redemptions: number | null;
  redemptions: number;
  is_active: boolean;
};

export async function fetchPromoOffers() {
  const response = await apiGet<{ offers: PromoOfferDto[] }>('/memberships/promo-offers');
  return response.offers;
}

export async function purchaseMembership(payload: {
  membershipId: string;
  durationMonths: number;
  autoRenew?: boolean;
}) {
  return apiPost<PurchaseMembershipResponse, typeof payload>('/memberships/purchase', payload);
}

export type MyMembershipDto = {
  membershipId: string;
  displayId: string | null;
  tier: string;
  tierName: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  startDateRaw: string | null;
  endDateRaw: string | null;
  remainingDays: number | null;
  autoRenew: boolean;
  visitsPerMonth: number | null;
  visitsUsed: number;
  visitsRemaining: number | null;
  totalVisits: number;
  maxChildren: number;
  maxAdults: number;
  discountPercent: number;
  guestPassesPerMonth: number;
  benefits: string[];
  referralName: string | null;
  referralStatus: string | null;
  children?: Array<{
    id: number;
    firstName: string;
    lastName: string | null;
    birthDate: string | null;
    photoUrl: string | null;
  }>;
};

export async function fetchMyMembership() {
  const response = await apiGet<{ membership: MyMembershipDto | null }>('/memberships/my');
  return response.membership;
}

export async function toggleAutoRenew(autoRenew: boolean) {
  return apiPatch<{ success: boolean; autoRenew: boolean }, { autoRenew: boolean }>(
    '/memberships/my/auto-renew',
    { autoRenew },
  );
}
