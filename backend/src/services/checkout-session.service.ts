/**
 * Checkout Session Service
 *
 * Tracks payment sessions in the database with a 5-minute expiry.
 * Ensures abandoned checkout sessions are properly marked as expired.
 */

import { supabaseAny } from '../config/supabase';
import { logger } from '../utils/logger';

const SESSION_TIMEOUT_MINUTES = 5;

export interface CheckoutSessionInput {
  customerId?: number | null;
  guestEmail?: string | null;
  items: Array<{ type: string; label: string; unitPrice: number }>;
  subtotal: number;
  tax: number;
  total: number;
}

export interface CheckoutSession {
  session_id: string;
  status: 'active' | 'expired' | 'completed' | 'cancelled';
  expires_at: string;
  created_at: string;
}

/**
 * Create a new checkout session with 5-minute expiry.
 */
export async function createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSession> {
  const expiresAt = new Date(Date.now() + SESSION_TIMEOUT_MINUTES * 60 * 1000).toISOString();

  const { data, error } = await supabaseAny
    .from('checkout_sessions')
    .insert({
      customer_id: input.customerId ?? null,
      guest_email: input.guestEmail ?? null,
      session_type: 'payment',
      status: 'active',
      items: input.items,
      subtotal: input.subtotal,
      tax: input.tax,
      total: input.total,
      expires_at: expiresAt,
    })
    .select('session_id, status, expires_at, created_at')
    .single();

  if (error) {
    logger.error({ error }, 'Failed to create checkout session');
    throw error;
  }

  logger.info({
    sessionId: data.session_id,
    total: input.total,
    itemCount: input.items.length,
    expiresAt,
  }, 'Checkout session created');

  return data as CheckoutSession;
}

/**
 * Mark a checkout session as completed (payment succeeded).
 */
export async function completeCheckoutSession(sessionId: string, orderId?: number): Promise<void> {
  const { error } = await supabaseAny
    .from('checkout_sessions')
    .update({
      status: 'completed',
      order_id: orderId ?? null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('session_id', sessionId)
    .in('status', ['active']);

  if (error) {
    logger.error({ error, sessionId }, 'Failed to complete checkout session');
  }
}

/**
 * Cancel a checkout session (user navigated away).
 */
export async function cancelCheckoutSession(sessionId: string): Promise<void> {
  const { error } = await supabaseAny
    .from('checkout_sessions')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('session_id', sessionId)
    .eq('status', 'active');

  if (error) {
    logger.error({ error, sessionId }, 'Failed to cancel checkout session');
  } else {
    logger.info({ sessionId }, 'Checkout session cancelled');
  }
}

/**
 * Get a checkout session by ID.
 */
export async function getCheckoutSession(sessionId: string): Promise<CheckoutSession | null> {
  const { data, error } = await supabaseAny
    .from('checkout_sessions')
    .select('session_id, status, expires_at, created_at')
    .eq('session_id', sessionId)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error({ error, sessionId }, 'Failed to get checkout session');
    return null;
  }

  return data as CheckoutSession | null;
}

/**
 * Expire all active checkout sessions past their expiry time.
 * Called every 60 seconds by the cleanup interval.
 *
 * @returns Number of sessions expired
 */
export async function expireCheckoutSessions(): Promise<number> {
  try {
    const { data, error } = await supabaseAny
      .from('checkout_sessions')
      .update({
        status: 'expired',
        expired_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('status', 'active')
      .lt('expires_at', new Date().toISOString())
      .select('session_id');

    if (error) {
      logger.error({ error }, 'Failed to expire checkout sessions');
      return 0;
    }

    const count = data?.length ?? 0;
    if (count > 0) {
      logger.info({ count }, 'Expired stale checkout sessions');
    }
    return count;
  } catch (err) {
    logger.error({ error: err }, 'Error expiring checkout sessions');
    return 0;
  }
}
