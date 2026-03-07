/**
 * Slot Reservation Routes
 *
 * Handles booking slot reservations for the 5-minute checkout timer.
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import {
  reserveSlot,
  cancelReservation,
  getReservation,
  getExistingReservation,
  extendReservation,
} from '../services/slot-reservation.service';
import { optionalSupabaseAuthGuard } from '../middleware/supabase-auth.middleware';
import { AppError } from '../utils/app-error';
import { logger } from '../utils/logger';

export const reservationRouter = Router();

interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    customer_id?: number;
  };
}

/**
 * Reserve a booking slot
 * POST /api/reservations
 */
reservationRouter.post(
  '/',
  optionalSupabaseAuthGuard,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { slotDate, slotTime, locationName, sessionId } = req.body;

      if (!slotDate || !slotTime || !locationName || !sessionId) {
        throw new AppError('Missing required fields: slotDate, slotTime, locationName, sessionId', 400);
      }

      // Validate date format (YYYY-MM-DD)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(slotDate)) {
        throw new AppError('Invalid date format. Use YYYY-MM-DD', 400);
      }

      // Validate time format (HH:MM)
      if (!/^\d{2}:\d{2}$/.test(slotTime)) {
        throw new AppError('Invalid time format. Use HH:MM', 400);
      }

      const userId = req.user?.id ?? null;

      const result = await reserveSlot(slotDate, slotTime, locationName, userId, sessionId);

      logger.info({
        reservationId: result.reservationId,
        slotDate,
        slotTime,
        locationName,
        userId,
      }, 'Slot reservation created');

      res.status(201).json({
        success: true,
        reservationId: result.reservationId,
        expiresAt: result.expiresAt,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Get existing reservation for a slot
 * GET /api/reservations/check
 */
reservationRouter.get(
  '/check',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { slotDate, slotTime, locationName, sessionId } = req.query;

      if (!slotDate || !slotTime || !locationName || !sessionId) {
        throw new AppError('Missing required query params', 400);
      }

      const reservation = await getExistingReservation(
        slotDate as string,
        slotTime as string,
        locationName as string,
        sessionId as string
      );

      if (reservation) {
        res.json({
          exists: true,
          reservationId: reservation.id,
          expiresAt: reservation.expires_at,
          status: reservation.status,
        });
      } else {
        res.json({ exists: false });
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Get reservation by ID
 * GET /api/reservations/:reservationId
 */
reservationRouter.get(
  '/:reservationId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { reservationId } = req.params;

      if (!reservationId) {
        throw new AppError('Reservation ID is required', 400);
      }

      const reservation = await getReservation(reservationId);

      if (!reservation) {
        throw new AppError('Reservation not found', 404);
      }

      res.json({
        reservationId: reservation.id,
        slotDate: reservation.slot_date,
        slotTime: reservation.slot_time,
        locationName: reservation.location_name,
        status: reservation.status,
        expiresAt: reservation.expires_at,
        confirmedAt: reservation.confirmed_at,
        bookingId: reservation.booking_id,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Extend a reservation
 * POST /api/reservations/:reservationId/extend
 */
reservationRouter.post(
  '/:reservationId/extend',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { reservationId } = req.params;
      const { sessionId } = req.body;

      if (!reservationId || !sessionId) {
        throw new AppError('Reservation ID and session ID are required', 400);
      }

      const newExpiresAt = await extendReservation(reservationId, sessionId);

      if (!newExpiresAt) {
        throw new AppError('Unable to extend reservation', 400);
      }

      res.json({
        success: true,
        expiresAt: newExpiresAt,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Cancel a reservation
 * POST /api/reservations/:reservationId/cancel
 */
reservationRouter.post(
  '/:reservationId/cancel',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { reservationId } = req.params;
      const { sessionId } = req.body;

      if (!reservationId || !sessionId) {
        throw new AppError('Reservation ID and session ID are required', 400);
      }

      await cancelReservation(reservationId, sessionId);

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Cancel a reservation (alternate DELETE endpoint)
 * DELETE /api/reservations/:reservationId
 */
reservationRouter.delete(
  '/:reservationId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { reservationId } = req.params;
      const { sessionId } = req.body;

      if (!reservationId || !sessionId) {
        throw new AppError('Reservation ID and session ID are required', 400);
      }

      await cancelReservation(reservationId, sessionId);

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }
);
