/**
 * Checkout Session API
 *
 * Tracks the 5-minute payment countdown timer in the database.
 * Creates a session when user enters payment mode, cancels when they navigate away.
 */

import { apiPost, apiGet } from './client';

export interface CreateCheckoutSessionRequest {
  items: Array<{ type: string; label: string; unitPrice: number }>;
  subtotal: number;
  tax: number;
  total: number;
  guestEmail?: string;
}

export interface CheckoutSessionResponse {
  success: boolean;
  sessionId: string;
  expiresAt: string;
  status: 'active' | 'expired' | 'completed' | 'cancelled';
}

export interface CheckoutSessionStatus {
  sessionId: string;
  status: 'active' | 'expired' | 'completed' | 'cancelled';
  expiresAt: string;
  createdAt: string;
}

/**
 * Create a checkout session (starts 5-minute countdown in DB)
 */
export async function createCheckoutSession(
  request: CreateCheckoutSessionRequest
): Promise<CheckoutSessionResponse> {
  return apiPost<CheckoutSessionResponse, CreateCheckoutSessionRequest>(
    '/reservations/checkout-sessions',
    request
  );
}

/**
 * Get checkout session status
 */
export async function getCheckoutSessionStatus(
  sessionId: string
): Promise<CheckoutSessionStatus> {
  return apiGet<CheckoutSessionStatus>(
    `/reservations/checkout-sessions/${sessionId}`
  );
}

/**
 * Cancel a checkout session (user navigated away from payment)
 */
export async function cancelCheckoutSession(
  sessionId: string
): Promise<void> {
  await apiPost<{ success: boolean }, Record<string, never>>(
    `/reservations/checkout-sessions/${sessionId}/cancel`,
    {}
  );
}
