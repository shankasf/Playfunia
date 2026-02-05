/**
 * Refund Service
 *
 * Handles refund processing via Square Refunds API with:
 * - Deterministic idempotency keys
 * - Validation (payment status, time limits, refund limits)
 * - Status tracking in database
 * - Error handling with retry logic
 */

import crypto from 'crypto';
import { getSquareClient } from '../config/square';
import { supabaseAny } from '../config/supabase';
import { logger } from '../utils/logger';
import { dollarsToCents, centsToDollars, toSquareMoney } from '../utils/currency';
import { withRetry } from '../utils/retry';

// Refund validation constants
const REFUND_TIME_LIMIT_DAYS = 365; // Square allows refunds within 1 year
const MAX_REFUNDS_PER_PAYMENT = 20; // Square limit

// Valid refund statuses
export type RefundStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'rejected';

export interface RefundRecord {
  refund_id: number;
  square_refund_id: string | null;
  square_payment_id: string;
  order_id: number | null;
  payment_id: number | null;
  booking_id: number | null;
  amount_cents: number;
  currency: string;
  status: RefundStatus;
  reason: string | null;
  initiated_by: number | null;
  idempotency_key: string;
  created_at: string;
  processed_at: string | null;
  error_code: string | null;
  error_message: string | null;
}

export interface CreateRefundRequest {
  paymentId: string;         // Square payment ID (required)
  amountDollars?: number;    // Refund amount in dollars - omit for full refund
  reason: string;            // Required reason for refund
  orderId?: number;          // Optional order ID to link
  bookingId?: number;        // Optional booking ID to link
  initiatedBy?: number;      // User ID of admin initiating refund
}

export interface RefundResult {
  refundId: number;
  squareRefundId: string | null;
  status: 'COMPLETED' | 'PENDING' | 'FAILED' | 'REJECTED';
  amountRefunded: number;
  currency: string;
  errorMessage?: string;
}

/**
 * Generate a deterministic idempotency key for refunds.
 * Uses payment ID + amount + hash to ensure uniqueness while preventing duplicates.
 */
function generateIdempotencyKey(paymentId: string, amountCents: number): string {
  const data = `${paymentId}_${amountCents}`;
  const hash = crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
  return `refund_${paymentId.slice(0, 20)}_${amountCents}_${hash}`;
}

/**
 * Validate that a payment can be refunded.
 * Checks:
 * - Payment exists and is COMPLETED
 * - Within 1 year time limit
 * - Under 20 refund limit per payment
 */
async function validatePaymentForRefund(
  paymentId: string,
  requestedAmountCents?: number
): Promise<{
  valid: boolean;
  error?: string;
  payment?: {
    id: string;
    status: string;
    amountMoney: { amount: bigint; currency: string };
    totalMoney: { amount: bigint; currency: string };
    refundedMoney?: { amount: bigint; currency: string };
    createdAt: string;
  };
}> {
  const square = getSquareClient();

  try {
    // Fetch payment from Square
    const { payment } = await withRetry(
      () => square.payments.get({ paymentId }),
      { operationName: 'getPayment', maxRetries: 2 }
    );

    if (!payment) {
      return { valid: false, error: 'Payment not found' };
    }

    // Check payment status
    if (payment.status !== 'COMPLETED') {
      return { valid: false, error: `Payment status is ${payment.status}, must be COMPLETED` };
    }

    // Check time limit (1 year)
    const paymentDate = new Date(payment.createdAt ?? '');
    const now = new Date();
    const daysSincePayment = (now.getTime() - paymentDate.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSincePayment > REFUND_TIME_LIMIT_DAYS) {
      return { valid: false, error: `Payment is over ${REFUND_TIME_LIMIT_DAYS} days old and cannot be refunded` };
    }

    // Check refund count limit
    const existingRefunds = await getRefundsForPayment(paymentId);
    if (existingRefunds.length >= MAX_REFUNDS_PER_PAYMENT) {
      return { valid: false, error: `Maximum ${MAX_REFUNDS_PER_PAYMENT} refunds per payment reached` };
    }

    // Calculate remaining refundable amount
    const totalAmountCents = Number(payment.totalMoney?.amount ?? 0n);
    const refundedAmountCents = Number(payment.refundedMoney?.amount ?? 0n);
    const remainingRefundable = totalAmountCents - refundedAmountCents;

    if (requestedAmountCents && requestedAmountCents > remainingRefundable) {
      return {
        valid: false,
        error: `Requested refund amount ($${centsToDollars(requestedAmountCents).toFixed(2)}) exceeds refundable amount ($${centsToDollars(remainingRefundable).toFixed(2)})`
      };
    }

    return {
      valid: true,
      payment: {
        id: payment.id ?? '',
        status: payment.status ?? '',
        amountMoney: {
          amount: payment.amountMoney?.amount ?? 0n,
          currency: payment.amountMoney?.currency ?? 'USD'
        },
        totalMoney: {
          amount: payment.totalMoney?.amount ?? 0n,
          currency: payment.totalMoney?.currency ?? 'USD'
        },
        refundedMoney: payment.refundedMoney ? {
          amount: payment.refundedMoney.amount ?? 0n,
          currency: payment.refundedMoney.currency ?? 'USD'
        } : undefined,
        createdAt: payment.createdAt ?? ''
      }
    };
  } catch (error) {
    logger.error({ error, paymentId }, 'Error validating payment for refund');
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Failed to validate payment'
    };
  }
}

/**
 * Get all refunds for a payment from our database.
 */
async function getRefundsForPayment(squarePaymentId: string): Promise<RefundRecord[]> {
  const { data, error } = await supabaseAny
    .from('refunds')
    .select('*')
    .eq('square_payment_id', squarePaymentId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error({ error, squarePaymentId }, 'Error fetching refunds for payment');
    return [];
  }

  return data ?? [];
}

/**
 * Create a refund record in the database.
 */
async function createRefundRecord(data: {
  squarePaymentId: string;
  amountCents: number;
  currency: string;
  reason: string;
  orderId?: number;
  bookingId?: number;
  paymentId?: number;
  initiatedBy?: number;
  idempotencyKey: string;
}): Promise<RefundRecord | null> {
  const { data: refund, error } = await supabaseAny
    .from('refunds')
    .insert({
      square_payment_id: data.squarePaymentId,
      amount_cents: data.amountCents,
      currency: data.currency,
      reason: data.reason,
      order_id: data.orderId ?? null,
      booking_id: data.bookingId ?? null,
      payment_id: data.paymentId ?? null,
      initiated_by: data.initiatedBy ?? null,
      idempotency_key: data.idempotencyKey,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    // Check for duplicate idempotency key
    if (error.code === '23505') {
      logger.info({ idempotencyKey: data.idempotencyKey }, 'Refund already exists with this idempotency key');
      // Fetch the existing refund
      const { data: existing } = await supabaseAny
        .from('refunds')
        .select('*')
        .eq('idempotency_key', data.idempotencyKey)
        .single();
      return existing;
    }
    logger.error({ error, data }, 'Error creating refund record');
    return null;
  }

  return refund;
}

/**
 * Update a refund record status.
 */
async function updateRefundRecord(
  refundId: number,
  updates: {
    status?: RefundStatus;
    squareRefundId?: string;
    processedAt?: string;
    errorCode?: string;
    errorMessage?: string;
  }
): Promise<void> {
  const { error } = await supabaseAny
    .from('refunds')
    .update({
      status: updates.status,
      square_refund_id: updates.squareRefundId,
      processed_at: updates.processedAt,
      error_code: updates.errorCode,
      error_message: updates.errorMessage,
    })
    .eq('refund_id', refundId);

  if (error) {
    logger.error({ error, refundId, updates }, 'Error updating refund record');
  }
}

/**
 * Process a refund request through Square Refunds API.
 */
export async function createRefund(request: CreateRefundRequest): Promise<RefundResult> {
  const { paymentId, amountDollars, reason, orderId, bookingId, initiatedBy } = request;

  logger.info({
    paymentId,
    amountDollars,
    reason,
    orderId,
    bookingId,
  }, 'Processing refund request');

  // Validate payment
  const validation = await validatePaymentForRefund(
    paymentId,
    amountDollars ? dollarsToCents(amountDollars) : undefined
  );

  if (!validation.valid || !validation.payment) {
    logger.warn({ paymentId, error: validation.error }, 'Refund validation failed');
    return {
      refundId: 0,
      squareRefundId: null,
      status: 'FAILED',
      amountRefunded: 0,
      currency: 'USD',
      errorMessage: validation.error || 'Validation failed',
    };
  }

  // Calculate refund amount
  const payment = validation.payment;
  const totalAmountCents = Number(payment.totalMoney.amount);
  const refundedAmountCents = Number(payment.refundedMoney?.amount ?? 0n);
  const remainingRefundable = totalAmountCents - refundedAmountCents;

  const refundAmountCents = amountDollars
    ? dollarsToCents(amountDollars)
    : remainingRefundable; // Full refund if no amount specified

  // Generate idempotency key
  const idempotencyKey = generateIdempotencyKey(paymentId, refundAmountCents);

  // Create local refund record
  const refundRecord = await createRefundRecord({
    squarePaymentId: paymentId,
    amountCents: refundAmountCents,
    currency: 'USD',
    reason,
    orderId,
    bookingId,
    initiatedBy,
    idempotencyKey,
  });

  if (!refundRecord) {
    return {
      refundId: 0,
      squareRefundId: null,
      status: 'FAILED',
      amountRefunded: 0,
      currency: 'USD',
      errorMessage: 'Failed to create refund record',
    };
  }

  // If refund already exists and is completed/processing, return it
  if (refundRecord.status === 'completed' || refundRecord.status === 'processing') {
    return {
      refundId: refundRecord.refund_id,
      squareRefundId: refundRecord.square_refund_id,
      status: refundRecord.status === 'completed' ? 'COMPLETED' : 'PENDING',
      amountRefunded: centsToDollars(refundRecord.amount_cents),
      currency: refundRecord.currency,
    };
  }

  // Update status to processing
  await updateRefundRecord(refundRecord.refund_id, { status: 'processing' });

  // Call Square Refunds API
  const square = getSquareClient();

  try {
    const refundResponse = await withRetry(
      () => square.refunds.refundPayment({
        idempotencyKey,
        paymentId,
        amountMoney: toSquareMoney(centsToDollars(refundAmountCents)),
        reason,
      }),
      { operationName: 'refundPayment', maxRetries: 3 }
    );

    const refund = refundResponse.refund;

    if (!refund) {
      throw new Error('No refund returned from Square');
    }

    // Map Square status to our status
    let status: RefundStatus;
    let resultStatus: 'COMPLETED' | 'PENDING' | 'FAILED' | 'REJECTED';

    switch (refund.status) {
      case 'COMPLETED':
        status = 'completed';
        resultStatus = 'COMPLETED';
        break;
      case 'PENDING':
        status = 'processing';
        resultStatus = 'PENDING';
        break;
      case 'REJECTED':
        status = 'rejected';
        resultStatus = 'REJECTED';
        break;
      case 'FAILED':
      default:
        status = 'failed';
        resultStatus = 'FAILED';
    }

    // Update refund record with Square response
    await updateRefundRecord(refundRecord.refund_id, {
      status,
      squareRefundId: refund.id,
      processedAt: new Date().toISOString(),
    });

    logger.info({
      refundId: refundRecord.refund_id,
      squareRefundId: refund.id,
      status: refund.status,
      amountCents: refundAmountCents,
    }, 'Refund processed successfully');

    return {
      refundId: refundRecord.refund_id,
      squareRefundId: refund.id ?? null,
      status: resultStatus,
      amountRefunded: centsToDollars(refundAmountCents),
      currency: 'USD',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    let errorCode = 'UNKNOWN';

    // Extract error code from Square errors
    if (error && typeof error === 'object' && 'errors' in error) {
      const squareError = error as { errors?: Array<{ code?: string }> };
      errorCode = squareError.errors?.[0]?.code ?? 'UNKNOWN';
    }

    logger.error({
      error,
      refundId: refundRecord.refund_id,
      paymentId,
    }, 'Refund failed');

    // Update refund record with error
    await updateRefundRecord(refundRecord.refund_id, {
      status: 'failed',
      errorCode,
      errorMessage,
      processedAt: new Date().toISOString(),
    });

    return {
      refundId: refundRecord.refund_id,
      squareRefundId: null,
      status: 'FAILED',
      amountRefunded: 0,
      currency: 'USD',
      errorMessage,
    };
  }
}

/**
 * Get a refund by ID.
 */
export async function getRefundById(refundId: number): Promise<RefundRecord | null> {
  const { data, error } = await supabaseAny
    .from('refunds')
    .select('*')
    .eq('refund_id', refundId)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error({ error, refundId }, 'Error fetching refund');
    return null;
  }

  return data;
}

/**
 * Get refunds for a Square payment ID.
 */
export async function getRefundsByPaymentId(squarePaymentId: string): Promise<RefundRecord[]> {
  return getRefundsForPayment(squarePaymentId);
}

/**
 * Sync refund status with Square.
 * Useful for refunds that were created externally (via Square Dashboard).
 */
export async function syncRefundFromSquare(squareRefundId: string): Promise<RefundRecord | null> {
  const square = getSquareClient();

  try {
    const { refund } = await withRetry(
      () => square.refunds.get({ refundId: squareRefundId }),
      { operationName: 'getRefund', maxRetries: 2 }
    );

    if (!refund) {
      return null;
    }

    // Check if we already have this refund
    const { data: existing } = await supabaseAny
      .from('refunds')
      .select('*')
      .eq('square_refund_id', squareRefundId)
      .single();

    if (existing) {
      // Update status if changed
      let status: RefundStatus;
      switch (refund.status) {
        case 'COMPLETED':
          status = 'completed';
          break;
        case 'PENDING':
          status = 'processing';
          break;
        case 'REJECTED':
          status = 'rejected';
          break;
        default:
          status = 'failed';
      }

      if (existing.status !== status) {
        await updateRefundRecord(existing.refund_id, {
          status,
          processedAt: new Date().toISOString(),
        });
      }

      return existing;
    }

    // Create record for externally-created refund (from Square Dashboard)
    const amountCents = Number(refund.amountMoney?.amount ?? 0n);
    const idempotencyKey = `external_${squareRefundId}`;

    const { data: newRefund, error } = await supabaseAny
      .from('refunds')
      .insert({
        square_refund_id: squareRefundId,
        square_payment_id: refund.paymentId,
        amount_cents: amountCents,
        currency: refund.amountMoney?.currency ?? 'USD',
        reason: refund.reason ?? 'Refunded via Square Dashboard',
        idempotency_key: idempotencyKey,
        status: refund.status === 'COMPLETED' ? 'completed' :
                refund.status === 'PENDING' ? 'processing' :
                refund.status === 'REJECTED' ? 'rejected' : 'failed',
        processed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      logger.error({ error, squareRefundId }, 'Error creating refund record from Square');
      return null;
    }

    logger.info({ squareRefundId, refundId: newRefund.refund_id }, 'Created refund record from Square Dashboard refund');

    return newRefund;
  } catch (error) {
    logger.error({ error, squareRefundId }, 'Error syncing refund from Square');
    return null;
  }
}

/**
 * List refunds with pagination and filters.
 */
export async function listRefunds(options: {
  limit?: number;
  offset?: number;
  status?: RefundStatus;
  orderId?: number;
  bookingId?: number;
}): Promise<{ refunds: RefundRecord[]; total: number }> {
  const { limit = 50, offset = 0, status, orderId, bookingId } = options;

  let query = supabaseAny
    .from('refunds')
    .select('*', { count: 'exact' });

  if (status) {
    query = query.eq('status', status);
  }
  if (orderId) {
    query = query.eq('order_id', orderId);
  }
  if (bookingId) {
    query = query.eq('booking_id', bookingId);
  }

  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    logger.error({ error, options }, 'Error listing refunds');
    return { refunds: [], total: 0 };
  }

  return {
    refunds: data ?? [],
    total: count ?? 0,
  };
}
