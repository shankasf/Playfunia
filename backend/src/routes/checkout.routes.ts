import { Router } from 'express';

import { supabaseAuthGuard } from '../middleware/supabase-auth.middleware';
import {
  createCheckoutIntentHandler,
  finalizeCheckoutHandler,
  createGuestCheckoutIntentHandler,
  finalizeGuestCheckoutHandler,
} from '../controllers/checkout.controller';

export const checkoutRouter = Router();

// Guest checkout routes (public - no auth required)
checkoutRouter.post('/guest/intent', createGuestCheckoutIntentHandler);
checkoutRouter.post('/guest/finalize', finalizeGuestCheckoutHandler);

// Authenticated checkout routes
checkoutRouter.post('/intent', supabaseAuthGuard, createCheckoutIntentHandler);
checkoutRouter.post('/finalize', supabaseAuthGuard, finalizeCheckoutHandler);
