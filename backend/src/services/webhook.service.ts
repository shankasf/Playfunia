/**
 * Square Webhook Service
 *
 * Handles Square webhook events with:
 * - Signature verification (HMAC-SHA256)
 * - Idempotent processing (event_id deduplication)
 * - Payment reconciliation
 */

import crypto from 'crypto';
import { supabaseAny } from '../config/supabase';
import { appConfig } from '../config/env';
import { logger } from '../utils/logger';
import { OrderRepository, PaymentRepository, PartyBookingRepository } from '../repositories';

export interface WebhookEvent {
  id: number;
  event_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  status: 'received' | 'processing' | 'processed' | 'failed';
  error_message: string | null;
  retry_count: number;
  created_at: string;
  processed_at: string | null;
}

export interface SquareWebhookPayload {
  merchant_id?: string;
  type: string;
  event_id: string;
  created_at: string;
  data: {
    type: string;
    id: string;
    object: {
      payment?: {
        id: string;
        status: string;
        amount_money?: { amount: number; currency: string };
        total_money?: { amount: number; currency: string };
        order_id?: string;
        reference_id?: string;
        receipt_url?: string;
        receipt_number?: string;
      };
      refund?: {
        id: string;
        status: string;
        payment_id: string;
        amount_money?: { amount: number; currency: string };
        reason?: string;
      };
      order?: {
        id: string;
        state: string;
        reference_id?: string;
      };
    };
  };
}

/**
 * Verify Square webhook signature.
 * Uses HMAC-SHA256 with timing-safe comparison.
 *
 * @param signature - X-Square-Hmacsha256-Signature header
 * @param webhookUrl - The full URL that received the webhook
 * @param body - Raw request body as string
 * @param signatureKey - Square webhook signature key
 * @returns true if signature is valid
 */
export function verifyWebhookSignature(
  signature: string,
  webhookUrl: string,
  body: string,
  signatureKey: string
): boolean {
  if (!signature || !signatureKey) {
    logger.warn('Missing signature or signature key for webhook verification');
    return false;
  }

  try {
    // Square signature format: url + body
    const payload = webhookUrl + body;

    const expectedSignature = crypto
      .createHmac('sha256', signatureKey)
      .update(payload)
      .digest('base64');

    // Use timing-safe comparison to prevent timing attacks
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch (err) {
    logger.error({ error: err }, 'Error verifying webhook signature');
    return false;
  }
}

/**
 * Check if a webhook event has already been processed (idempotency check).
 *
 * @param eventId - Square event ID
 * @returns true if already processed
 */
export async function isEventProcessed(eventId: string): Promise<boolean> {
  const { data, error } = await supabaseAny
    .from('webhook_events')
    .select('id, status')
    .eq('event_id', eventId)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error({ error, eventId }, 'Error checking webhook event');
    return false;
  }

  return data?.status === 'processed';
}

/**
 * Store a webhook event for processing.
 * Uses upsert to handle duplicates gracefully.
 *
 * @param eventId - Square event ID
 * @param eventType - Event type (e.g., "payment.completed")
 * @param payload - Full webhook payload
 * @returns The stored event or null if duplicate
 */
export async function storeWebhookEvent(
  eventId: string,
  eventType: string,
  payload: Record<string, unknown>
): Promise<WebhookEvent | null> {
  try {
    const { data, error } = await supabaseAny
      .from('webhook_events')
      .upsert(
        {
          event_id: eventId,
          event_type: eventType,
          payload,
          status: 'processing',
        },
        { onConflict: 'event_id', ignoreDuplicates: false }
      )
      .select()
      .single();

    if (error) {
      // Unique constraint violation = already exists
      if (error.code === '23505') {
        logger.info({ eventId }, 'Webhook event already exists');
        return null;
      }
      throw error;
    }

    return data;
  } catch (err) {
    logger.error({ error: err, eventId }, 'Error storing webhook event');
    return null;
  }
}

/**
 * Mark a webhook event as processed.
 *
 * @param eventId - Square event ID
 */
export async function markEventProcessed(eventId: string): Promise<void> {
  await supabaseAny
    .from('webhook_events')
    .update({
      status: 'processed',
      processed_at: new Date().toISOString(),
    })
    .eq('event_id', eventId);
}

/**
 * Mark a webhook event as failed.
 *
 * @param eventId - Square event ID
 * @param errorMessage - Error description
 */
export async function markEventFailed(eventId: string, errorMessage: string): Promise<void> {
  // First get current retry count
  const { data: event } = await supabaseAny
    .from('webhook_events')
    .select('retry_count')
    .eq('event_id', eventId)
    .single();

  const currentRetryCount = event?.retry_count ?? 0;

  await supabaseAny
    .from('webhook_events')
    .update({
      status: 'failed',
      error_message: errorMessage,
      retry_count: currentRetryCount + 1,
    })
    .eq('event_id', eventId);
}

/**
 * Process a Square webhook event.
 * Handles different event types appropriately.
 *
 * @param payload - Parsed webhook payload
 */
export async function processWebhookEvent(payload: SquareWebhookPayload): Promise<void> {
  const eventType = payload.type;
  const eventId = payload.event_id;

  logger.info({ eventType, eventId }, 'Processing webhook event');

  try {
    switch (eventType) {
      case 'payment.completed':
        await handlePaymentCompleted(payload);
        break;

      case 'payment.updated':
        await handlePaymentUpdated(payload);
        break;

      case 'refund.created':
      case 'refund.updated':
        await handleRefundEvent(payload);
        break;

      case 'order.updated':
        await handleOrderUpdated(payload);
        break;

      default:
        logger.info({ eventType, eventId }, 'Unhandled webhook event type');
    }

    await markEventProcessed(eventId);
    logger.info({ eventType, eventId }, 'Webhook event processed successfully');
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ error: err, eventType, eventId }, 'Error processing webhook event');
    await markEventFailed(eventId, errorMessage);
    throw err;
  }
}

/**
 * Handle payment.completed webhook.
 * Reconciles payment status with our records.
 */
async function handlePaymentCompleted(payload: SquareWebhookPayload): Promise<void> {
  const payment = payload.data?.object?.payment;
  if (!payment) {
    logger.warn('payment.completed event missing payment data');
    return;
  }

  const paymentId = payment.id;
  const referenceId = payment.reference_id;

  logger.info({
    paymentId,
    referenceId,
    status: payment.status,
    amount: payment.total_money?.amount,
  }, 'Payment completed webhook');

  // If reference_id contains "order_", reconcile with order
  if (referenceId?.startsWith('order_')) {
    const orderId = parseInt(referenceId.replace('order_', ''), 10);
    if (!isNaN(orderId)) {
      await reconcileOrder(orderId, paymentId, 'COMPLETED');
    }
  }

  // If reference_id contains "booking_", reconcile with booking
  if (referenceId?.startsWith('booking_')) {
    const bookingId = parseInt(referenceId.replace('booking_', ''), 10);
    if (!isNaN(bookingId)) {
      await reconcileBookingPayment(bookingId, paymentId, 'COMPLETED');
    }
  }
}

/**
 * Handle payment.updated webhook.
 * Handles status changes (e.g., FAILED, CANCELED).
 */
async function handlePaymentUpdated(payload: SquareWebhookPayload): Promise<void> {
  const payment = payload.data?.object?.payment;
  if (!payment) return;

  const paymentId = payment.id;
  const referenceId = payment.reference_id;
  const status = payment.status;

  logger.info({ paymentId, referenceId, status }, 'Payment updated webhook');

  if (status === 'FAILED' || status === 'CANCELED') {
    // Handle payment failure - may need to release reservation or mark order as failed
    if (referenceId?.startsWith('order_')) {
      const orderId = parseInt(referenceId.replace('order_', ''), 10);
      if (!isNaN(orderId)) {
        await reconcileOrder(orderId, paymentId, status);
      }
    }
  }
}

/**
 * Handle refund webhooks.
 * Creates or updates refund records in the database for reconciliation.
 */
async function handleRefundEvent(payload: SquareWebhookPayload): Promise<void> {
  const refund = payload.data?.object?.refund;
  if (!refund) return;

  const squareRefundId = refund.id;
  const squarePaymentId = refund.payment_id;
  const status = refund.status;
  const amountCents = refund.amount_money?.amount ?? 0;
  const reason = refund.reason;

  logger.info({
    squareRefundId,
    squarePaymentId,
    status,
    amountCents,
    reason,
  }, 'Processing refund webhook');

  // Map Square status to our status
  let dbStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'rejected';
  switch (status) {
    case 'COMPLETED':
      dbStatus = 'completed';
      break;
    case 'PENDING':
      dbStatus = 'processing';
      break;
    case 'REJECTED':
      dbStatus = 'rejected';
      break;
    case 'FAILED':
    default:
      dbStatus = 'failed';
  }

  // Check if we already have this refund in the database
  const { data: existingRefund, error: findError } = await supabaseAny
    .from('refunds')
    .select('*')
    .eq('square_refund_id', squareRefundId)
    .single();

  if (findError && findError.code !== 'PGRST116') {
    logger.error({ error: findError, squareRefundId }, 'Error checking for existing refund');
  }

  if (existingRefund) {
    // Update existing refund status
    if (existingRefund.status !== dbStatus) {
      const { error: updateError } = await supabaseAny
        .from('refunds')
        .update({
          status: dbStatus,
          processed_at: new Date().toISOString(),
        })
        .eq('refund_id', existingRefund.refund_id);

      if (updateError) {
        logger.error({ error: updateError, squareRefundId }, 'Error updating refund status');
      } else {
        logger.info({
          refundId: existingRefund.refund_id,
          oldStatus: existingRefund.status,
          newStatus: dbStatus,
        }, 'Refund status updated via webhook');
      }
    }
  } else {
    // Create record for externally-created refund (from Square Dashboard)
    const idempotencyKey = `webhook_${squareRefundId}`;

    const { data: newRefund, error: insertError } = await supabaseAny
      .from('refunds')
      .insert({
        square_refund_id: squareRefundId,
        square_payment_id: squarePaymentId,
        amount_cents: amountCents,
        currency: refund.amount_money?.currency ?? 'USD',
        reason: reason ?? 'Refunded via Square Dashboard',
        idempotency_key: idempotencyKey,
        status: dbStatus,
        processed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      // Ignore duplicate key errors (already processed)
      if (insertError.code !== '23505') {
        logger.error({ error: insertError, squareRefundId }, 'Error creating refund record from webhook');
      }
    } else if (newRefund) {
      logger.info({
        refundId: newRefund.refund_id,
        squareRefundId,
        status: dbStatus,
      }, 'Created refund record from webhook');
    }
  }

  // If refund is completed, potentially update related order/booking
  if (dbStatus === 'completed') {
    // Try to find associated order by payment ID and update status
    const { data: payments } = await supabaseAny
      .from('payments')
      .select('order_id')
      .eq('provider_payment_id', squarePaymentId);

    if (payments && payments.length > 0) {
      for (const payment of payments) {
        if (payment.order_id) {
          const { error: orderUpdateError } = await supabaseAny
            .from('orders')
            .update({ status: 'Refunded' })
            .eq('order_id', payment.order_id)
            .in('status', ['Completed', 'Pending', 'Processing']);

          if (orderUpdateError) {
            logger.error({ error: orderUpdateError, orderId: payment.order_id }, 'Error updating order status to Refunded');
          } else {
            logger.info({ orderId: payment.order_id }, 'Order marked as Refunded via webhook');
          }
        }
      }
    }
  }
}

/**
 * Handle order.updated webhook.
 */
async function handleOrderUpdated(payload: SquareWebhookPayload): Promise<void> {
  const order = payload.data?.object?.order;
  if (!order) return;

  logger.info({
    orderId: order.id,
    state: order.state,
    referenceId: order.reference_id,
  }, 'Order updated webhook');
}

/**
 * Reconcile order with payment status from Square.
 */
async function reconcileOrder(
  orderId: number,
  squarePaymentId: string,
  status: string
): Promise<void> {
  try {
    const order = await OrderRepository.findById(orderId);
    if (!order) {
      logger.warn({ orderId }, 'Order not found for reconciliation');
      return;
    }

    // Update payment record if exists
    const payments = await PaymentRepository.findByOrderId(orderId);
    const payment = payments.find(p => p.provider_payment_id === squarePaymentId);

    if (payment) {
      const newStatus = status === 'COMPLETED' ? 'Captured' : 'Failed';
      if (payment.status !== newStatus) {
        await PaymentRepository.update(payment.payment_id, { status: newStatus });
        logger.info({
          paymentId: payment.payment_id,
          oldStatus: payment.status,
          newStatus,
        }, 'Payment status updated via webhook');
      }
    }

    // Update order status if payment failed
    if (status === 'FAILED' || status === 'CANCELED') {
      if (order.status === 'Pending' || order.status === 'Processing') {
        await OrderRepository.update(orderId, { status: 'Failed' });
        logger.info({ orderId, status }, 'Order marked as failed via webhook');
      }
    }
  } catch (err) {
    logger.error({ error: err, orderId, squarePaymentId }, 'Error reconciling order');
  }
}

/**
 * Reconcile booking payment status from Square.
 */
async function reconcileBookingPayment(
  bookingId: number,
  squarePaymentId: string,
  status: string
): Promise<void> {
  try {
    const booking = await PartyBookingRepository.findById(bookingId);
    if (!booking) {
      logger.warn({ bookingId }, 'Booking not found for reconciliation');
      return;
    }

    // If payment completed and booking not yet confirmed, confirm it
    if (status === 'COMPLETED' && booking.payment_status !== 'deposit_paid' && booking.payment_status !== 'paid') {
      await PartyBookingRepository.update(bookingId, {
        payment_status: 'deposit_paid',
        status: 'Confirmed',
        deposit_paid_at: new Date().toISOString(),
        latest_payment_intent_id: squarePaymentId,
      });
      logger.info({ bookingId, squarePaymentId }, 'Booking confirmed via webhook');
    }

    // If payment failed, mark booking accordingly
    if (status === 'FAILED' || status === 'CANCELED') {
      if (booking.payment_status === 'pending') {
        await PartyBookingRepository.update(bookingId, {
          payment_status: 'failed',
          notes: `Payment failed: ${status}`,
        });
        logger.info({ bookingId, status }, 'Booking payment marked as failed via webhook');
      }
    }
  } catch (err) {
    logger.error({ error: err, bookingId, squarePaymentId }, 'Error reconciling booking payment');
  }
}

/**
 * Retry failed webhook events.
 * Should be called periodically (e.g., every 5 minutes).
 *
 * @param maxRetries - Maximum retry attempts
 * @returns Number of events retried
 */
export async function retryFailedWebhooks(maxRetries: number = 3): Promise<number> {
  try {
    const { data: failedEvents, error } = await supabaseAny
      .from('webhook_events')
      .select('*')
      .eq('status', 'failed')
      .lt('retry_count', maxRetries)
      .order('created_at', { ascending: true })
      .limit(10);

    if (error || !failedEvents?.length) {
      return 0;
    }

    let retriedCount = 0;
    for (const event of failedEvents) {
      try {
        logger.info({ eventId: event.event_id, attempt: event.retry_count + 1 }, 'Retrying failed webhook');

        await supabaseAny
          .from('webhook_events')
          .update({ status: 'processing' })
          .eq('id', event.id);

        await processWebhookEvent(event.payload as SquareWebhookPayload);
        retriedCount++;
      } catch (err) {
        logger.error({ error: err, eventId: event.event_id }, 'Webhook retry failed');
      }
    }

    return retriedCount;
  } catch (err) {
    logger.error({ error: err }, 'Error retrying failed webhooks');
    return 0;
  }
}
