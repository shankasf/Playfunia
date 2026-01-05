import { apiGet, apiPost } from './client';

export type MembershipPlanDto = {
  id: string;
  name: string;
  description?: string;
  monthlyPrice: number;
  benefits: string[];
  maxChildren: number;
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

export async function purchaseMembership(payload: {
  membershipId: string;
  durationMonths: number;
  autoRenew?: boolean;
}) {
  return apiPost<PurchaseMembershipResponse, typeof payload>('/memberships/purchase', payload);
}
