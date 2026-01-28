import { Router } from 'express';

import {
  verifyReceipt,
  downloadReceiptPdf,
  getCustomerReceipts,
} from '../controllers/receipt.controller';
import { optionalSupabaseAuthGuard } from '../middleware/supabase-auth.middleware';

export const receiptRouter = Router();

// Public verification endpoint - anyone can verify a receipt
receiptRouter.get('/verify/:receiptNumber', verifyReceipt);

// PDF download - public for now (receipt number serves as authentication)
receiptRouter.get('/:receiptNumber/pdf', downloadReceiptPdf);

// Customer receipts - requires auth or at least optional auth
receiptRouter.get('/customer/:customerId', optionalSupabaseAuthGuard, getCustomerReceipts);
