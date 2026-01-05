import { Router } from 'express';

import { authGuard } from '../middleware/auth.middleware';
import {
  getSquareConfigHandler,
  createSquareCheckoutIntentHandler,
  finalizeSquareCheckoutHandler,
  createSquareGuestCheckoutIntentHandler,
  finalizeSquareGuestCheckoutHandler,
} from '../controllers/square.controller';

export const squareRouter = Router();

// Public route to get Square config (app ID, location ID)
squareRouter.get('/config', getSquareConfigHandler);

// Guest checkout routes (public - no auth required)
squareRouter.post('/guest/intent', createSquareGuestCheckoutIntentHandler);
squareRouter.post('/guest/finalize', finalizeSquareGuestCheckoutHandler);

// Authenticated checkout routes
squareRouter.post('/intent', authGuard, createSquareCheckoutIntentHandler);
squareRouter.post('/finalize', authGuard, finalizeSquareCheckoutHandler);
