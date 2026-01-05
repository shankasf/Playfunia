import { apiGet, apiPost } from './client';
import type { CheckoutSummary } from './checkout';

// Square configuration response
export interface SquareConfig {
  applicationId: string | null;
  locationId: string | null;
  environment: 'sandbox' | 'production';
  available: boolean;
}

// Square checkout intent payload (same structure as regular checkout)
export interface SquareCheckoutIntentPayload {
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
}

// Square checkout intent response (no clientSecret - frontend handles tokenization)
export interface SquareCheckoutIntentResponse {
  amount: number;
  currency: string;
  summary: CheckoutSummary;
  promoCode?: string;
}

// Square checkout finalize payload (includes payment token from SDK)
export interface SquareCheckoutFinalizePayload extends SquareCheckoutIntentPayload {
  sourceId: string; // Payment token from Square Web Payments SDK
  verificationToken?: string; // SCA verification token if required
}

// Square checkout finalize response
export interface SquareCheckoutFinalizeResponse {
  paymentId: string;
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
  receiptUrl?: string | null;
}

// Guest checkout types
export interface SquareGuestCheckoutIntentPayload extends SquareCheckoutIntentPayload {
  guestFirstName: string;
  guestLastName: string;
  guestEmail: string;
  guestPhone: string;
}

export interface SquareGuestCheckoutFinalizePayload extends SquareGuestCheckoutIntentPayload {
  sourceId: string;
  verificationToken?: string;
}

// API functions
export function getSquareConfig() {
  return apiGet<SquareConfig>('/square/config');
}

export function createSquareCheckoutIntent(payload: SquareCheckoutIntentPayload) {
  return apiPost<SquareCheckoutIntentResponse, SquareCheckoutIntentPayload>('/square/intent', payload);
}

export function finalizeSquareCheckout(payload: SquareCheckoutFinalizePayload) {
  return apiPost<SquareCheckoutFinalizeResponse, SquareCheckoutFinalizePayload>('/square/finalize', payload);
}

export function createSquareGuestCheckoutIntent(payload: SquareGuestCheckoutIntentPayload) {
  return apiPost<SquareCheckoutIntentResponse, SquareGuestCheckoutIntentPayload>('/square/guest/intent', payload);
}

export function finalizeSquareGuestCheckout(payload: SquareGuestCheckoutFinalizePayload) {
  return apiPost<SquareCheckoutFinalizeResponse, SquareGuestCheckoutFinalizePayload>('/square/guest/finalize', payload);
}
