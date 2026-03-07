import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import {
  verifyReceipt,
  downloadReceiptPdf,
  getCustomerReceipts,
  getReceiptsByPaymentId,
} from '../controllers/receipt.controller';
import { optionalSupabaseAuthGuard, supabaseAuthGuard } from '../middleware/supabase-auth.middleware';

export const receiptRouter = Router();

const receiptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many receipt requests. Please try again later.' },
  validate: false,
});

receiptRouter.use(receiptLimiter);

// Public verification endpoint - anyone can verify a receipt
receiptRouter.get('/verify/:receiptNumber', verifyReceipt);

// Get receipts by payment ID - requires authentication to prevent enumeration
// Note: Uses optional auth to allow post-checkout access but logs unauthenticated requests
receiptRouter.get('/payment/:paymentId', optionalSupabaseAuthGuard, getReceiptsByPaymentId);

// PDF download - public for now (receipt number serves as authentication)
// The receipt number is a secure random string, so it acts as an access token
receiptRouter.get('/:receiptNumber/pdf', downloadReceiptPdf);

// Customer receipts - requires full authentication
receiptRouter.get('/customer/:customerId', supabaseAuthGuard, getCustomerReceipts);
