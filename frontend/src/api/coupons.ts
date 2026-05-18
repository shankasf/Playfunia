import { apiDelete, apiGet, apiPatch, apiPost, apiPostPublic } from './client';

export type CouponCategory = 'all' | 'membership' | 'ticket' | 'party_booking';

export type CouponCartItem =
  | { type: 'ticket'; unitPrice: number; quantity: number }
  | { type: 'membership'; unitPrice: number }
  | { type: 'booking'; unitPrice: number };

export interface ValidateCouponRequest {
  code: string;
  items: CouponCartItem[];
}

export interface ValidateCouponSuccess {
  valid: true;
  code: string;
  description: string | null;
  appliesTo: CouponCategory[];
  percentOff: number | null;
  amountOffUsd: number | null;
  eligibleSubtotal: number;
  discountAmount: number;
  label: string;
}

export interface ValidateCouponFailure {
  valid: false;
  message: string;
}

export type ValidateCouponResponse = ValidateCouponSuccess | ValidateCouponFailure;

/**
 * Public coupon validation endpoint — used by the cart UI to preview the discount.
 * Calls backend /api/coupons/validate which never throws on invalid codes,
 * it returns { valid: false, message } so the UI can render the error inline.
 */
export async function validateCoupon(payload: ValidateCouponRequest): Promise<ValidateCouponResponse> {
  try {
    const data = await apiPostPublic<ValidateCouponSuccess, ValidateCouponRequest>('/coupons/validate', payload);
    return data;
  } catch (err) {
    return { valid: false, message: err instanceof Error ? err.message : 'Coupon code is not valid' };
  }
}

// ============= Admin coupon CRUD =============
export interface AdminCoupon {
  promotion_id: number;
  code: string;
  description: string | null;
  percent_off: number | null;
  amount_off_usd: number | null;
  valid_from: string | null;
  valid_to: string | null;
  max_redemptions: number | null;
  redemptions: number;
  is_active: boolean;
  applies_to: CouponCategory[];
  min_purchase_usd: number | null;
  created_at: string | null;
}

export interface AdminCouponPayload {
  code: string;
  description?: string | null;
  percent_off?: number | null;
  amount_off_usd?: number | null;
  valid_from?: string | null;
  valid_to?: string | null;
  max_redemptions?: number | null;
  is_active?: boolean;
  applies_to?: CouponCategory[];
  min_purchase_usd?: number | null;
}

export async function fetchAdminCoupons() {
  const data = await apiGet<{ coupons: AdminCoupon[]; categories: CouponCategory[] }>('/admin/coupons');
  return data;
}

export async function createAdminCoupon(payload: AdminCouponPayload) {
  const data = await apiPost<{ coupon: AdminCoupon }, AdminCouponPayload>('/admin/coupons', payload);
  return data.coupon;
}

export async function updateAdminCoupon(id: number, updates: Partial<AdminCouponPayload>) {
  const data = await apiPatch<{ coupon: AdminCoupon }, Partial<AdminCouponPayload>>(`/admin/coupons/${id}`, updates);
  return data.coupon;
}

export async function deleteAdminCoupon(id: number) {
  return apiDelete<{ success: boolean }>(`/admin/coupons/${id}`);
}
