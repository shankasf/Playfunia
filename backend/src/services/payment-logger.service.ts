/**
 * Payment Logger Service
 *
 * Comprehensive logging for Square payment transactions.
 * Tracks all payment attempts, successes, and failures for debugging and audit.
 *
 * Based on Square best practices:
 * - https://developer.squareup.com/docs/build-basics/general-considerations/handling-errors
 * - https://developer.squareup.com/docs/payments-api/error-codes
 */

import type { Payment, CreatePaymentRequest } from 'square';

// Square error type (matches Square API error structure)
export interface SquareError {
  category?: string;
  code?: string;
  detail?: string;
  field?: string;
}
import { PaymentLogRepository, type PaymentLog } from '../repositories';
import { logger } from '../utils/logger';

// Square error categories
export type SquareErrorCategory =
  | 'API_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'INVALID_REQUEST_ERROR'
  | 'RATE_LIMIT_ERROR'
  | 'PAYMENT_METHOD_ERROR'
  | 'REFUND_ERROR';

// Payment status values
export type PaymentStatus =
  | 'initiated'
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'refunded';

// Payment types
export type PaymentType =
  | 'booking_deposit'
  | 'ticket_purchase'
  | 'membership_purchase'
  | 'balance_payment'
  | 'checkout';

export interface PaymentLogContext {
  idempotencyKey: string;
  customerId?: number | null;
  userId?: number | null;
  bookingId?: number | null;
  paymentType: PaymentType;
  amount: number;
  referenceId?: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentLogResult {
  logId: number;
  idempotencyKey: string;
}

/**
 * Mask sensitive data in request payload for logging
 */
function maskSensitiveData(payload: Record<string, unknown>): Record<string, unknown> {
  const masked = { ...payload };

  // Mask sourceId (card nonce)
  if (masked.sourceId && typeof masked.sourceId === 'string') {
    masked.sourceId = masked.sourceId.substring(0, 8) + '...[MASKED]';
  }

  // Mask verification token
  if (masked.verificationToken && typeof masked.verificationToken === 'string') {
    masked.verificationToken = '[MASKED]';
  }

  return masked;
}

/**
 * Extract card details from Square payment response
 */
function extractCardDetails(payment: Payment): {
  cardBrand?: string;
  cardLast4?: string;
  cardExpMonth?: number;
  cardExpYear?: number;
  entryMethod?: string;
  cvvStatus?: string;
  avsStatus?: string;
} {
  const cardDetails = payment.cardDetails;
  if (!cardDetails) return {};

  // Convert bigint to number safely
  const expMonth = cardDetails.card?.expMonth;
  const expYear = cardDetails.card?.expYear;

  return {
    cardBrand: cardDetails.card?.cardBrand,
    cardLast4: cardDetails.card?.last4,
    cardExpMonth: expMonth != null ? Number(expMonth) : undefined,
    cardExpYear: expYear != null ? Number(expYear) : undefined,
    entryMethod: cardDetails.entryMethod,
    cvvStatus: cardDetails.cvvStatus,
    avsStatus: cardDetails.avsStatus,
  };
}

/**
 * Extract risk evaluation details
 */
function extractRiskDetails(payment: Payment): {
  riskLevel?: string;
  riskScore?: number;
} {
  const riskEvaluation = payment.riskEvaluation;
  if (!riskEvaluation) return {};

  return {
    riskLevel: riskEvaluation.riskLevel,
  };
}

/**
 * Log payment initiation (before calling Square)
 */
export async function logPaymentInitiated(
  context: PaymentLogContext,
  request: CreatePaymentRequest
): Promise<PaymentLogResult> {
  const initiatedAt = new Date().toISOString();

  try {
    const log = await PaymentLogRepository.create({
      idempotency_key: context.idempotencyKey,
      customer_id: context.customerId,
      user_id: context.userId,
      booking_id: context.bookingId,
      provider: 'square',
      payment_type: context.paymentType,
      amount_usd: context.amount,
      status: 'initiated',
      source_type: request.sourceId ? 'card_nonce' : undefined,
      location_id: request.locationId,
      reference_id: context.referenceId ?? request.referenceId,
      request_payload: maskSensitiveData(request as unknown as Record<string, unknown>),
      ip_address: context.ipAddress,
      user_agent: context.userAgent,
      session_id: context.sessionId,
      metadata: context.metadata ?? {},
      initiated_at: initiatedAt,
    });

    logger.info({
      msg: 'Payment initiated',
      logId: log.log_id,
      idempotencyKey: context.idempotencyKey,
      paymentType: context.paymentType,
      amount: context.amount,
      customerId: context.customerId,
      bookingId: context.bookingId,
    });

    return {
      logId: log.log_id,
      idempotencyKey: context.idempotencyKey,
    };
  } catch (error) {
    logger.error({
      msg: 'Failed to log payment initiation',
      error,
      context,
    });
    // Return a dummy result so payment can still proceed
    return {
      logId: -1,
      idempotencyKey: context.idempotencyKey,
    };
  }
}

/**
 * Log successful payment completion
 */
export async function logPaymentCompleted(
  logResult: PaymentLogResult,
  payment: Payment,
  processingTimeMs: number
): Promise<void> {
  const completedAt = new Date().toISOString();
  const cardDetails = extractCardDetails(payment);
  const riskDetails = extractRiskDetails(payment);

  try {
    if (logResult.logId > 0) {
      await PaymentLogRepository.update(logResult.logId, {
        status: 'completed',
        previous_status: 'initiated',
        payment_id: payment.id,
        order_id: payment.orderId,
        response_code: payment.status,
        square_receipt_number: payment.receiptNumber,
        square_receipt_url: payment.receiptUrl,
        card_brand: cardDetails.cardBrand,
        card_last4: cardDetails.cardLast4,
        card_exp_month: cardDetails.cardExpMonth,
        card_exp_year: cardDetails.cardExpYear,
        entry_method: cardDetails.entryMethod,
        cvv_status: cardDetails.cvvStatus,
        avs_status: cardDetails.avsStatus,
        risk_level: riskDetails.riskLevel,
        processing_time_ms: processingTimeMs,
        response_payload: payment as unknown as Record<string, unknown>,
        completed_at: completedAt,
      });
    }

    logger.info({
      msg: 'Payment completed',
      logId: logResult.logId,
      idempotencyKey: logResult.idempotencyKey,
      paymentId: payment.id,
      status: payment.status,
      receiptNumber: payment.receiptNumber,
      processingTimeMs,
      cardBrand: cardDetails.cardBrand,
      cardLast4: cardDetails.cardLast4,
      riskLevel: riskDetails.riskLevel,
    });
  } catch (error) {
    logger.error({
      msg: 'Failed to log payment completion',
      error,
      logResult,
      paymentId: payment.id,
    });
  }
}

/**
 * Log payment failure
 */
export async function logPaymentFailed(
  logResult: PaymentLogResult,
  errors: SquareError[],
  processingTimeMs: number,
  responsePayload?: unknown
): Promise<void> {
  const completedAt = new Date().toISOString();
  const primaryError = errors[0];

  try {
    if (logResult.logId > 0) {
      await PaymentLogRepository.update(logResult.logId, {
        status: 'failed',
        previous_status: 'initiated',
        error_category: primaryError?.category,
        error_code: primaryError?.code,
        error_detail: primaryError?.detail,
        error_field: primaryError?.field,
        processing_time_ms: processingTimeMs,
        response_payload: {
          errors,
          ...(responsePayload as Record<string, unknown> ?? {}),
        },
        completed_at: completedAt,
      });
    }

    logger.error({
      msg: 'Payment failed',
      logId: logResult.logId,
      idempotencyKey: logResult.idempotencyKey,
      errorCategory: primaryError?.category,
      errorCode: primaryError?.code,
      errorDetail: primaryError?.detail,
      errorField: primaryError?.field,
      processingTimeMs,
      allErrors: errors,
    });
  } catch (error) {
    logger.error({
      msg: 'Failed to log payment failure',
      error,
      logResult,
      paymentErrors: errors,
    });
  }
}

/**
 * Get user-friendly error message based on Square error code
 * Based on https://developer.squareup.com/docs/payments-api/error-codes
 */
export function getUserFriendlyErrorMessage(errorCode: string | undefined): string {
  if (!errorCode) {
    return 'An unexpected error occurred. Please try again.';
  }
  const errorMessages: Record<string, string> = {
    // Card errors
    CARD_DECLINED: 'Your card was declined. Please try a different payment method.',
    CARD_DECLINED_CALL_ISSUER: 'Your card was declined. Please contact your card issuer.',
    CARD_DECLINED_VERIFICATION_REQUIRED: 'Additional verification is required. Please try again.',
    CVV_FAILURE: 'The CVV code entered is incorrect. Please check and try again.',
    ADDRESS_VERIFICATION_FAILURE: 'Address verification failed. Please check your billing address.',
    INVALID_CARD: 'The card number is invalid. Please check and try again.',
    INVALID_EXPIRATION: 'The expiration date is invalid. Please check and try again.',
    CARD_EXPIRED: 'Your card has expired. Please use a different card.',
    INSUFFICIENT_FUNDS: 'Insufficient funds. Please try a different payment method.',
    CARD_NOT_SUPPORTED: 'This card type is not supported. Please try a different card.',

    // Processing errors
    GENERIC_DECLINE: 'The payment was declined. Please try again or use a different card.',
    INVALID_ACCOUNT: 'There was an issue with the account. Please try a different payment method.',
    CURRENCY_MISMATCH: 'There was a currency issue. Please try again.',
    CARDHOLDER_INSUFFICIENT_PERMISSIONS: 'This card cannot be used for this transaction.',

    // Technical errors
    INVALID_LOCATION: 'There was a configuration issue. Please try again later.',
    TRANSACTION_LIMIT: 'The transaction limit has been exceeded.',
    VOICE_FAILURE: 'Voice authorization is required. Please contact support.',
    PAN_FAILURE: 'There was an issue with the card number. Please try again.',
    EXPIRATION_FAILURE: 'There was an issue with the expiration date. Please try again.',
    CARD_TOKEN_EXPIRED: 'The payment session has expired. Please refresh and try again.',
    CARD_TOKEN_USED: 'This payment has already been processed.',

    // Rate limiting
    RATE_LIMITED: 'Too many requests. Please wait a moment and try again.',

    // Default
    UNKNOWN_ERROR: 'An unexpected error occurred. Please try again.',
  };

  return errorMessages[errorCode] ?? errorMessages.UNKNOWN_ERROR ?? 'An unexpected error occurred. Please try again.';
}

/**
 * Check if error is retryable
 */
export function isRetryableError(errorCode: string): boolean {
  const retryableCodes = [
    'RATE_LIMITED',
    'TIMEOUT',
    'SERVICE_UNAVAILABLE',
    'GATEWAY_TIMEOUT',
    'INTERNAL_SERVER_ERROR',
  ];

  return retryableCodes.includes(errorCode);
}

/**
 * Get payment logs for a booking (for admin dashboard)
 */
export async function getPaymentLogsForBooking(bookingId: number): Promise<PaymentLog[]> {
  return PaymentLogRepository.findByBookingId(bookingId);
}

/**
 * Get payment logs for a customer (for admin dashboard)
 */
export async function getPaymentLogsForCustomer(customerId: number, limit = 50): Promise<PaymentLog[]> {
  return PaymentLogRepository.findByCustomerId(customerId, limit);
}

/**
 * Get recent failed payments (for admin monitoring)
 */
export async function getRecentFailedPayments(limit = 100): Promise<PaymentLog[]> {
  return PaymentLogRepository.findFailedPayments(limit);
}

/**
 * Get recent payment logs (for admin monitoring)
 */
export async function getRecentPaymentLogs(limit = 100): Promise<PaymentLog[]> {
  return PaymentLogRepository.findRecentLogs(limit);
}
