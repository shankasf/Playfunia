/**
 * Refund Routes
 *
 * Admin-only routes for refund operations.
 */

import { Router } from 'express';
import {
  createRefundHandler,
  getRefundHandler,
  getRefundsByPaymentHandler,
  listRefundsHandler,
} from '../controllers/refund.controller';
import { supabaseAuthGuard, requireRoles, ROLES } from '../middleware/supabase-auth.middleware';

export const refundRouter = Router();

// All refund routes require admin authentication
refundRouter.use(supabaseAuthGuard, requireRoles(ROLES.ADMIN, ROLES.EMPLOYEE));

// List refunds with pagination and filters
// GET /api/refunds?limit=50&offset=0&status=completed&orderId=123
refundRouter.get('/', listRefundsHandler);

// Create a new refund
// POST /api/refunds { paymentId, amount?, reason, orderId?, bookingId? }
refundRouter.post('/', createRefundHandler);

// Get refunds for a Square payment ID
// GET /api/refunds/payment/:paymentId
refundRouter.get('/payment/:paymentId', getRefundsByPaymentHandler);

// Get a specific refund by ID
// GET /api/refunds/:id
refundRouter.get('/:id', getRefundHandler);
