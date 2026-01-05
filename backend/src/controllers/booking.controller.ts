import type { Response } from "express";
import { ZodError } from "zod";

import type { AuthenticatedRequest } from "../middleware/auth.middleware";
import {
  cancelBooking,
  checkBookingAvailability,
  createBooking,
  createGuestBooking,
  estimateBookingPrice,
  completeBookingDepositPayment,
  initiateBookingDepositPayment,
  listAllBookings,
  listAvailableSlots,
  listBookingsForGuardian,
  updateBookingStatus,
  recalculateBookingPricing,
} from "../services/booking.service";
import {
  bookingAvailabilitySchema,
  bookingEstimateSchema,
  bookingIdParamSchema,
  bookingSlotsQuerySchema,
  createBookingSchema,
  createGuestBookingSchema,
  bookingDepositConfirmSchema,
  updateBookingStatusSchema,
} from "../schemas/booking.schema";
import { AppError } from "../utils/app-error";
import { asyncHandler } from "../utils/async-handler";

export const createBookingHandler = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized", 401);
  }

  const payload = parseWithSchema(createBookingSchema, {
    ...req.body,
    guardianId: req.user.id,
  });

  const result = await createBooking(payload);
  return res.status(201).json(result);
});

export const listBookingsHandler = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized", 401);
  }

  const bookings = await listBookingsForGuardian(req.user.id);
  return res.status(200).json({ bookings });
});

export const cancelBookingHandler = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized", 401);
  }

  const { bookingId } = parseWithSchema(bookingIdParamSchema, req.params);
  const result = await cancelBooking(req.user.id, bookingId);
  return res.status(200).json(result);
});

export const checkBookingAvailabilityHandler = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw new AppError("Unauthorized", 401);
    }

    const payload = parseWithSchema(bookingAvailabilitySchema, req.body);
    const result = await checkBookingAvailability(req.user.id, payload);
    return res.status(200).json(result);
  },
);

export const listBookingSlotsHandler = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized", 401);
  }

  const query = parseWithSchema(bookingSlotsQuerySchema, {
    location: req.query.location,
    eventDate: req.query.eventDate,
  });
  const result = await listAvailableSlots(query);
  return res.status(200).json(result);
});

export const estimateBookingPriceHandler = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw new AppError("Unauthorized", 401);
    }

    const payload = parseWithSchema(bookingEstimateSchema, req.body);
    const result = await estimateBookingPrice(payload);
    return res.status(200).json(result);
  },
);

export const listAllBookingsHandler = asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  const bookings = await listAllBookings();
  return res.status(200).json({ bookings });
});

export const updateBookingStatusHandler = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { bookingId } = parseWithSchema(bookingIdParamSchema, req.params);
    const payload = parseWithSchema(updateBookingStatusSchema, req.body);

    const updated = await updateBookingStatus(bookingId, payload);
    return res.status(200).json(updated);
  },
);

export const createBookingDepositIntentHandler = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized", 401);
  }

  const { bookingId } = parseWithSchema(bookingIdParamSchema, req.params);
  const intent = await initiateBookingDepositPayment(req.user.id, bookingId);
  return res.status(200).json(intent);
});

export const confirmBookingDepositHandler = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized", 401);
  }

  const { bookingId } = parseWithSchema(bookingIdParamSchema, req.params);
  const { paymentIntentId } = parseWithSchema(bookingDepositConfirmSchema, req.body);
  const result = await completeBookingDepositPayment(req.user.id, bookingId, paymentIntentId);
  return res.status(200).json(result);
});

export const createGuestBookingHandler = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  // No auth required for guest bookings
  const payload = parseWithSchema(createGuestBookingSchema, req.body);
  const result = await createGuestBooking(payload);
  return res.status(201).json(result);
});

export const recalculateBookingPricingHandler = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  // Support both :id (from admin routes) and :bookingId (from booking routes)
  const bookingId = req.params.id ?? req.params.bookingId;
  if (!bookingId) {
    throw new AppError('Booking ID is required', 400);
  }
  const result = await recalculateBookingPricing(bookingId);
  return res.status(200).json(result);
});

function parseWithSchema<T>(schema: { parse: (data: unknown) => T }, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const message = error.issues.map(issue => issue.message).join(", ");
      throw new AppError(`Validation failed: ${message}`, 400, { cause: error });
    }
    throw error;
  }
}
