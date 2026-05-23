import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { supabaseAuthGuard } from '../middleware/supabase-auth.middleware';
import {
  getSquareConfigHandler,
  createSquareCheckoutIntentHandler,
  finalizeSquareCheckoutHandler,
  createSquareGuestCheckoutIntentHandler,
  finalizeSquareGuestCheckoutHandler,
} from '../controllers/square.controller';

export const squareRouter = Router();

// Only count COMPLETED payment attempts toward the limit. Failed requests —
// validation errors (e.g. price mismatch) and card declines (4xx/5xx) — are not
// counted, so a legitimate customer retrying a fixable problem is never locked
// out. The ceiling is a coarse abuse guard; Square's own fraud scoring is the
// primary card-testing defense. (See git history for the bundle price bug that
// made repeated validation failures exhaust the old strict limit.)
const checkoutFinalizeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => (req as any).user?.id ?? req.ip ?? 'unknown',
  skipFailedRequests: true,
  message: { message: 'Too many payment attempts. Please try again later.' },
  validate: false,
});

const guestCheckoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skipFailedRequests: true,
  message: { message: 'Too many payment attempts. Please try again later.' },
  validate: false,
});

// Public route to get Square config (app ID, location ID)
squareRouter.get('/config', getSquareConfigHandler);

// Guest checkout routes (public - no auth required)
squareRouter.post('/guest/intent', createSquareGuestCheckoutIntentHandler);
squareRouter.post('/guest/finalize', guestCheckoutLimiter, finalizeSquareGuestCheckoutHandler);

// Authenticated checkout routes
squareRouter.post('/intent', supabaseAuthGuard, createSquareCheckoutIntentHandler);
squareRouter.post('/finalize', supabaseAuthGuard, checkoutFinalizeLimiter, finalizeSquareCheckoutHandler);
