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

const checkoutFinalizeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => (req as any).user?.id ?? req.ip ?? 'unknown',
  message: { message: 'Too many payment attempts. Please try again later.' },
  validate: false,
});

const guestCheckoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
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
