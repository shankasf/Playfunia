import { Router } from 'express';

import { authGuard } from '../middleware/auth.middleware';
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
checkoutRouter.post('/intent', authGuard, createCheckoutIntentHandler);
checkoutRouter.post('/finalize', authGuard, finalizeCheckoutHandler);
