/**
 * Refund Controller
 *
 * HTTP handlers for refund operations (admin only).
 */

import type { Request, Response, NextFunction } from 'express';
import {
  createRefund,
  getRefundById,
  getRefundsByPaymentId,
  listRefunds,
  type CreateRefundRequest,
  type RefundStatus,
} from '../services/refund.service';
import { AppError } from '../utils/app-error';
import { logger } from '../utils/logger';
import type { SupabaseAuthenticatedRequest } from '../middleware/supabase-auth.middleware';

/**
 * Create a new refund.
 * POST /api/refunds
 */
export async function createRefundHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authReq = req as SupabaseAuthenticatedRequest;
    const userId = authReq.user?.id ? parseInt(authReq.user.id, 10) : undefined;

    const { paymentId, amount, reason, orderId, bookingId } = req.body;

    // Validate required fields
    if (!paymentId) {
      throw new AppError('paymentId is required', 400);
    }
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      throw new AppError('reason is required', 400);
    }

    // Validate amount if provided
    if (amount !== undefined) {
      if (typeof amount !== 'number' || amount <= 0) {
        throw new AppError('amount must be a positive number', 400);
      }
    }

    const request: CreateRefundRequest = {
      paymentId,
      amountDollars: amount,
      reason: reason.trim(),
      orderId: orderId ? parseInt(orderId, 10) : undefined,
      bookingId: bookingId ? parseInt(bookingId, 10) : undefined,
      initiatedBy: userId,
    };

    logger.info({
      paymentId,
      amount,
      reason: request.reason,
      initiatedBy: userId,
    }, 'Creating refund');

    const result = await createRefund(request);

    if (result.status === 'FAILED') {
      res.status(400).json({
        success: false,
        error: result.errorMessage || 'Refund failed',
        refundId: result.refundId || undefined,
      });
      return;
    }

    res.status(201).json({
      success: true,
      data: {
        refundId: result.refundId,
        squareRefundId: result.squareRefundId,
        status: result.status,
        amountRefunded: result.amountRefunded,
        currency: result.currency,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get a refund by ID.
 * GET /api/refunds/:id
 */
export async function getRefundHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const idParam = req.params.id;
    if (!idParam) {
      throw new AppError('Refund ID is required', 400);
    }

    const refundId = parseInt(idParam, 10);

    if (isNaN(refundId)) {
      throw new AppError('Invalid refund ID', 400);
    }

    const refund = await getRefundById(refundId);

    if (!refund) {
      throw new AppError('Refund not found', 404);
    }

    res.json({
      success: true,
      data: formatRefundResponse(refund),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get refunds for a payment.
 * GET /api/refunds/payment/:paymentId
 */
export async function getRefundsByPaymentHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const paymentId = req.params.paymentId;

    if (!paymentId || typeof paymentId !== 'string') {
      throw new AppError('paymentId is required', 400);
    }

    const refunds = await getRefundsByPaymentId(paymentId);

    res.json({
      success: true,
      data: refunds.map(formatRefundResponse),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * List refunds with pagination and filters.
 * GET /api/refunds
 */
export async function listRefundsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const offset = parseInt(req.query.offset as string, 10) || 0;
    const status = req.query.status as RefundStatus | undefined;
    const orderId = req.query.orderId ? parseInt(req.query.orderId as string, 10) : undefined;
    const bookingId = req.query.bookingId ? parseInt(req.query.bookingId as string, 10) : undefined;

    // Validate status if provided
    const validStatuses: RefundStatus[] = ['pending', 'processing', 'completed', 'failed', 'rejected'];
    if (status && !validStatuses.includes(status)) {
      throw new AppError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
    }

    const { refunds, total } = await listRefunds({
      limit: Math.min(limit, 100), // Cap at 100
      offset,
      status,
      orderId,
      bookingId,
    });

    res.json({
      success: true,
      data: refunds.map(formatRefundResponse),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + refunds.length < total,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Format refund record for API response.
 */
function formatRefundResponse(refund: {
  refund_id: number;
  square_refund_id: string | null;
  square_payment_id: string;
  order_id: number | null;
  payment_id: number | null;
  booking_id: number | null;
  amount_cents: number;
  currency: string;
  status: string;
  reason: string | null;
  initiated_by: number | null;
  created_at: string;
  processed_at: string | null;
  error_code: string | null;
  error_message: string | null;
}) {
  return {
    refundId: refund.refund_id,
    squareRefundId: refund.square_refund_id,
    squarePaymentId: refund.square_payment_id,
    orderId: refund.order_id,
    paymentId: refund.payment_id,
    bookingId: refund.booking_id,
    amount: refund.amount_cents / 100, // Convert cents to dollars
    currency: refund.currency,
    status: refund.status.toUpperCase(),
    reason: refund.reason,
    initiatedBy: refund.initiated_by,
    createdAt: refund.created_at,
    processedAt: refund.processed_at,
    errorCode: refund.error_code,
    errorMessage: refund.error_message,
  };
}
