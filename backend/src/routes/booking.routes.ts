import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import {
  cancelBookingHandler,
  checkBookingAvailabilityHandler,
  createBookingHandler,
  createGuestBookingHandler,
  estimateBookingPriceHandler,
  listBookingSlotsHandler,
  listAllBookingsHandler,
  listBookingsHandler,
  processSquareDepositHandler,
  updateBookingStatusHandler,
  rescheduleBookingHandler,
} from '../controllers/booking.controller';
import { supabaseAuthGuard, optionalSupabaseAuthGuard, requireRoles } from '../middleware/supabase-auth.middleware';

const guestBookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many booking requests. Please try again later.' },
  validate: false,
});

// Rate limiter for authenticated deposit payments — keyed on user ID to prevent
// card-testing attacks and Square API abuse
const depositPaymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 payment attempts per user per window
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use authenticated user ID when available, fall back to IP
    return (req as any).user?.id ?? req.ip ?? 'unknown';
  },
  message: { message: 'Too many payment attempts. Please try again later.' },
  validate: false,
});

export const bookingRouter = Router();

// Public routes (no auth required)
bookingRouter.post('/guest', guestBookingLimiter, createGuestBookingHandler);
bookingRouter.get('/slots', optionalSupabaseAuthGuard, listBookingSlotsHandler);
bookingRouter.post('/estimate', optionalSupabaseAuthGuard, estimateBookingPriceHandler);

// Protected routes
bookingRouter.use(supabaseAuthGuard);
bookingRouter.post('/', createBookingHandler);
bookingRouter.get('/', listBookingsHandler);
bookingRouter.post('/availability', checkBookingAvailabilityHandler);
bookingRouter.post('/:bookingId/deposit/square', depositPaymentLimiter, processSquareDepositHandler);
bookingRouter.patch('/:bookingId/cancel', cancelBookingHandler);
bookingRouter.patch('/:bookingId/reschedule', rescheduleBookingHandler);
bookingRouter.get('/admin', requireRoles('admin', 'staff'), listAllBookingsHandler);
bookingRouter.patch(
  '/:bookingId/status',
  requireRoles('admin', 'staff'),
  updateBookingStatusHandler,
);
