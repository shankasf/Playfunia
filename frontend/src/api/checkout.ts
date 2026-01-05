import { apiPost } from './client';

export type CheckoutDiscount = { label: string; amount: number };

export type CheckoutLine = {
  type: 'ticket' | 'membership';
  label: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  discounts: CheckoutDiscount[];
  total: number;
};

export type CheckoutSummary = {
  currency: string;
  subtotal: number;
  discounts: CheckoutDiscount[];
  total: number;
  lines: CheckoutLine[];
};

export type CheckoutIntentPayload = {
  items: Array<
    | {
        type: 'ticket';
        label: string;
        quantity: number;
        unitPrice: number;
        metadata?: Record<string, unknown>;
      }
    | {
        type: 'membership';
        label: string;
        membershipId: string;
        durationMonths: number;
        autoRenew?: boolean;
        unitPrice: number;
      }
  >;
  promoCode?: string;
};

export type CheckoutIntentResponse = {
  clientSecret: string;
  paymentIntentId?: string;
  amount: number;
  currency: string;
  summary: CheckoutSummary;
  promoCode?: string;
  mock?: boolean;
};

export type CheckoutFinalizePayload = CheckoutIntentPayload & {
  paymentIntentId: string;
};

export type CheckoutFinalizeResponse = {
  paymentIntentId: string;
  summary: CheckoutSummary;
  tickets: Array<{
    cartIndex: number;
    ticket: { id?: string; codes: Array<{ code: string; status: string }> };
  }>;
  memberships: Array<{
    cartIndex: number;
    membership: {
      membershipId: string;
      tierName: string;
      startedAt: string;
      expiresAt: string;
      autoRenew: boolean;
      visitsPerMonth: number | null;
    };
  }>;
  receiptEmail: string | null;
};

export function createCheckoutIntent(payload: CheckoutIntentPayload) {
  return apiPost<CheckoutIntentResponse, CheckoutIntentPayload>('/checkout/intent', payload);
}

export function finalizeCheckout(payload: CheckoutFinalizePayload) {
  return apiPost<CheckoutFinalizeResponse, CheckoutFinalizePayload>('/checkout/finalize', payload);
}

// Guest checkout types
export type GuestCheckoutIntentPayload = CheckoutIntentPayload & {
  guestFirstName: string;
  guestLastName: string;
  guestEmail: string;
  guestPhone: string;
};

export type GuestCheckoutFinalizePayload = GuestCheckoutIntentPayload & {
  paymentIntentId: string;
};

// Guest checkout API functions
export function createGuestCheckoutIntent(payload: GuestCheckoutIntentPayload) {
  return apiPost<CheckoutIntentResponse, GuestCheckoutIntentPayload>('/checkout/guest/intent', payload);
}

export function finalizeGuestCheckout(payload: GuestCheckoutFinalizePayload) {
  return apiPost<CheckoutFinalizeResponse, GuestCheckoutFinalizePayload>('/checkout/guest/finalize', payload);
}
