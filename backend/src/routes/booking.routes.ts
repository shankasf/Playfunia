import { Router } from 'express';

import {
  cancelBookingHandler,
  checkBookingAvailabilityHandler,
  createBookingHandler,
  createGuestBookingHandler,
  createBookingDepositIntentHandler,
  estimateBookingPriceHandler,
  listBookingSlotsHandler,
  listAllBookingsHandler,
  listBookingsHandler,
  confirmBookingDepositHandler,
  updateBookingStatusHandler,
} from '../controllers/booking.controller';
import { authGuard, optionalAuthGuard, requireRoles } from '../middleware/auth.middleware';

export const bookingRouter = Router();

// Public routes (no auth required)
bookingRouter.post('/guest', createGuestBookingHandler);
bookingRouter.get('/slots', optionalAuthGuard, listBookingSlotsHandler);
bookingRouter.post('/estimate', optionalAuthGuard, estimateBookingPriceHandler);

// Protected routes
bookingRouter.use(authGuard);
bookingRouter.post('/', createBookingHandler);
bookingRouter.get('/', listBookingsHandler);
bookingRouter.post('/availability', checkBookingAvailabilityHandler);
bookingRouter.post('/:bookingId/deposit-intent', createBookingDepositIntentHandler);
bookingRouter.post('/:bookingId/deposit/confirm', confirmBookingDepositHandler);
bookingRouter.patch('/:bookingId/cancel', cancelBookingHandler);
bookingRouter.get('/admin', requireRoles('admin', 'staff'), listAllBookingsHandler);
bookingRouter.patch(
  '/:bookingId/status',
  requireRoles('admin', 'staff'),
  updateBookingStatusHandler,
);
