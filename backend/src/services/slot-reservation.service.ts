/**
 * Slot Reservation Service
 *
 * Provides 5-minute timed slot reservations to prevent double-booking race conditions.
 * Uses PostgreSQL stored procedures for atomic operations.
 */

import { supabaseAny } from '../config/supabase';
import { AppError } from '../utils/app-error';
import { logger } from '../utils/logger';

const RESERVATION_TIMEOUT_MINUTES = 5;

export interface SlotReservation {
  id: string;
  slot_date: string;
  slot_time: string;
  location_name: string;
  user_id: number | null;
  session_id: string;
  status: 'pending' | 'confirmed' | 'expired' | 'cancelled';
  expires_at: string;
  created_at: string;
  confirmed_at: string | null;
  booking_id: number | null;
}

export interface ReserveSlotResult {
  reservationId: string;
  expiresAt: string;
}

/**
 * Reserve a booking slot for a user/session.
 * Uses database-level locking to prevent race conditions.
 *
 * @param slotDate - Date in YYYY-MM-DD format
 * @param slotTime - Time in HH:MM format
 * @param locationName - Location name (e.g., "Albany")
 * @param userId - User ID (null for guests)
 * @param sessionId - Browser session ID for tracking
 * @returns Reservation ID and expiry time
 * @throws AppError if slot is not available
 */
export async function reserveSlot(
  slotDate: string,
  slotTime: string,
  locationName: string,
  userId: number | null,
  sessionId: string
): Promise<ReserveSlotResult> {
  try {
    // Call the stored procedure for atomic reservation
    const { data, error } = await supabaseAny.rpc('reserve_slot', {
      p_slot_date: slotDate,
      p_slot_time: slotTime,
      p_location_name: locationName,
      p_user_id: userId,
      p_session_id: sessionId,
      p_timeout_minutes: RESERVATION_TIMEOUT_MINUTES,
    });

    if (error) {
      logger.error({ error, slotDate, slotTime, locationName }, 'Failed to reserve slot via RPC');

      // SECURITY: RPC is required for proper race condition protection
      // The fallback has a TOCTOU vulnerability between checking and inserting
      if (error.code === '42883') { // function does not exist
        logger.error('CRITICAL: reserve_slot RPC not found - migration required for race condition protection');
        // Still use fallback but with a warning - unique index provides last-line defense
        return await reserveSlotFallback(slotDate, slotTime, locationName, userId, sessionId);
      }

      throw new AppError('Failed to reserve slot. Please try again.', 500);
    }

    // RPC returns an array with one row
    const result = Array.isArray(data) ? data[0] : data;

    if (!result?.success) {
      throw new AppError(result?.error_message || 'Slot is no longer available', 409);
    }

    logger.info({
      reservationId: result.reservation_id,
      slotDate,
      slotTime,
      locationName,
      userId,
      expiresAt: result.expires_at,
    }, 'Slot reserved successfully');

    return {
      reservationId: result.reservation_id,
      expiresAt: result.expires_at,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error({ error: err, slotDate, slotTime, locationName }, 'Error reserving slot');
    throw new AppError('Failed to reserve slot. Please try again.', 500);
  }
}

/**
 * Fallback reservation method if stored procedure doesn't exist.
 * Less safe but functional for development/testing.
 */
async function reserveSlotFallback(
  slotDate: string,
  slotTime: string,
  locationName: string,
  userId: number | null,
  sessionId: string
): Promise<ReserveSlotResult> {
  const expiresAt = new Date(Date.now() + RESERVATION_TIMEOUT_MINUTES * 60 * 1000).toISOString();

  // First, expire any stale reservations
  await supabaseAny
    .from('slot_reservations')
    .update({ status: 'expired' })
    .eq('slot_date', slotDate)
    .eq('slot_time', slotTime)
    .eq('location_name', locationName)
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString());

  // Check for existing active reservation
  const { data: existing } = await supabaseAny
    .from('slot_reservations')
    .select('id')
    .eq('slot_date', slotDate)
    .eq('slot_time', slotTime)
    .eq('location_name', locationName)
    .in('status', ['pending', 'confirmed'])
    .gt('expires_at', new Date().toISOString())
    .limit(1);

  if (existing && existing.length > 0) {
    throw new AppError('Slot is no longer available', 409);
  }

  // Try to insert
  const { data, error } = await supabaseAny
    .from('slot_reservations')
    .insert({
      slot_date: slotDate,
      slot_time: slotTime,
      location_name: locationName,
      user_id: userId,
      session_id: sessionId,
      status: 'pending',
      expires_at: expiresAt,
    })
    .select('id, expires_at')
    .single();

  if (error) {
    // Unique constraint violation = race condition
    if (error.code === '23505') {
      throw new AppError('Slot was just reserved by another user', 409);
    }
    throw error;
  }

  return {
    reservationId: data.id,
    expiresAt: data.expires_at,
  };
}

/**
 * Confirm a reservation after successful payment.
 * Links the reservation to the created booking.
 *
 * @param reservationId - UUID of the reservation
 * @param bookingId - ID of the created booking (optional)
 * @throws AppError if reservation is expired or invalid
 */
export async function confirmReservation(
  reservationId: string,
  bookingId?: number
): Promise<void> {
  try {
    // Try RPC first
    const { data, error } = await supabaseAny.rpc('confirm_reservation', {
      p_reservation_id: reservationId,
      p_booking_id: bookingId ?? null,
    });

    if (error) {
      // Fallback if RPC doesn't exist
      if (error.code === '42883') {
        await confirmReservationFallback(reservationId, bookingId);
        return;
      }
      throw error;
    }

    const result = Array.isArray(data) ? data[0] : data;

    if (!result?.success) {
      throw new AppError(result?.error_message || 'Failed to confirm reservation', 410);
    }

    logger.info({ reservationId, bookingId }, 'Reservation confirmed');
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error({ error: err, reservationId }, 'Error confirming reservation');
    throw new AppError('Failed to confirm reservation', 500);
  }
}

/**
 * Fallback confirmation method if stored procedure doesn't exist.
 */
async function confirmReservationFallback(
  reservationId: string,
  bookingId?: number
): Promise<void> {
  // Get current state
  const { data: reservation, error: fetchError } = await supabaseAny
    .from('slot_reservations')
    .select('status, expires_at')
    .eq('id', reservationId)
    .single();

  if (fetchError || !reservation) {
    throw new AppError('Reservation not found', 404);
  }

  if (reservation.status === 'confirmed') {
    return; // Already confirmed
  }

  if (reservation.status !== 'pending') {
    throw new AppError(`Reservation is ${reservation.status}`, 410);
  }

  if (new Date(reservation.expires_at) < new Date()) {
    await supabaseAny
      .from('slot_reservations')
      .update({ status: 'expired' })
      .eq('id', reservationId);
    throw new AppError('Reservation has expired', 410);
  }

  // Update to confirmed
  const { error: updateError } = await supabaseAny
    .from('slot_reservations')
    .update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      booking_id: bookingId ?? null,
    })
    .eq('id', reservationId)
    .eq('status', 'pending');

  if (updateError) {
    throw new AppError('Failed to confirm reservation', 500);
  }
}

/**
 * Cancel a reservation (e.g., if user leaves checkout page).
 *
 * @param reservationId - UUID of the reservation
 * @param sessionId - Session ID for verification (prevents others from cancelling)
 */
export async function cancelReservation(
  reservationId: string,
  sessionId: string
): Promise<void> {
  try {
    const { error } = await supabaseAny
      .from('slot_reservations')
      .update({ status: 'cancelled' })
      .eq('id', reservationId)
      .eq('session_id', sessionId)
      .eq('status', 'pending');

    if (error) {
      logger.error({ error, reservationId }, 'Failed to cancel reservation');
    } else {
      logger.info({ reservationId }, 'Reservation cancelled');
    }
  } catch (err) {
    // Don't throw - cancellation is best-effort
    logger.error({ error: err, reservationId }, 'Error cancelling reservation');
  }
}

/**
 * Get a reservation by ID.
 * Used to check status on frontend.
 *
 * @param reservationId - UUID of the reservation
 * @returns Reservation data or null
 */
export async function getReservation(
  reservationId: string
): Promise<SlotReservation | null> {
  const { data, error } = await supabaseAny
    .from('slot_reservations')
    .select('*')
    .eq('id', reservationId)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error({ error, reservationId }, 'Error fetching reservation');
    return null;
  }

  return data;
}

/**
 * Get reservation by session to check if user already has one for a slot.
 *
 * @param slotDate - Date in YYYY-MM-DD format
 * @param slotTime - Time in HH:MM format
 * @param locationName - Location name
 * @param sessionId - Browser session ID
 * @returns Reservation if exists and not expired
 */
export async function getExistingReservation(
  slotDate: string,
  slotTime: string,
  locationName: string,
  sessionId: string
): Promise<SlotReservation | null> {
  const { data, error } = await supabaseAny
    .from('slot_reservations')
    .select('*')
    .eq('slot_date', slotDate)
    .eq('slot_time', slotTime)
    .eq('location_name', locationName)
    .eq('session_id', sessionId)
    .in('status', ['pending', 'confirmed'])
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error({ error }, 'Error fetching existing reservation');
    return null;
  }

  return data;
}

/**
 * Check if a slot is available (no active reservations or bookings).
 *
 * @param slotDate - Date in YYYY-MM-DD format
 * @param slotTime - Time in HH:MM format
 * @param locationName - Location name
 * @returns true if available, false if taken
 */
export async function isSlotAvailable(
  slotDate: string,
  slotTime: string,
  locationName: string
): Promise<boolean> {
  // Find active reservations: confirmed ones (always block) or pending ones that haven't expired
  const now = new Date().toISOString();
  const { data, error } = await supabaseAny
    .from('slot_reservations')
    .select('id')
    .eq('slot_date', slotDate)
    .eq('slot_time', slotTime)
    .eq('location_name', locationName)
    .or(`status.eq.confirmed,and(status.eq.pending,expires_at.gt.${now})`)
    .limit(1);

  if (error) {
    logger.error({ error }, 'Error checking slot availability');
    return false; // Assume unavailable on error for safety
  }

  return !data || data.length === 0;
}

/**
 * Clean up expired reservations.
 * Should be called periodically (e.g., every minute via cron).
 *
 * @returns Number of reservations expired
 */
export async function cleanupExpiredReservations(): Promise<number> {
  try {
    // Try RPC first
    const { data, error } = await supabaseAny.rpc('cleanup_expired_reservations');

    if (error) {
      // Fallback if RPC doesn't exist
      if (error.code === '42883') {
        const { data: updated } = await supabaseAny
          .from('slot_reservations')
          .update({ status: 'expired' })
          .eq('status', 'pending')
          .lt('expires_at', new Date().toISOString())
          .select('id');

        const count = updated?.length ?? 0;
        if (count > 0) {
          logger.info({ count }, 'Cleaned up expired reservations');
        }
        return count;
      }
      throw error;
    }

    if (data > 0) {
      logger.info({ count: data }, 'Cleaned up expired reservations via RPC');
    }
    return data;
  } catch (err) {
    logger.error({ error: err }, 'Error cleaning up expired reservations');
    return 0;
  }
}

/**
 * Extend a reservation (e.g., if user is actively entering payment info).
 * Only extends if within the original timeout window.
 *
 * @param reservationId - UUID of the reservation
 * @param sessionId - Session ID for verification
 * @param additionalMinutes - Minutes to extend (default: 2)
 * @returns New expiry time or null if extension failed
 */
export async function extendReservation(
  reservationId: string,
  sessionId: string,
  additionalMinutes: number = 2
): Promise<string | null> {
  const maxExtensionMinutes = RESERVATION_TIMEOUT_MINUTES + 3; // Max 8 minutes total
  const newExpiresAt = new Date(Date.now() + additionalMinutes * 60 * 1000).toISOString();

  const { data, error } = await supabaseAny
    .from('slot_reservations')
    .update({ expires_at: newExpiresAt })
    .eq('id', reservationId)
    .eq('session_id', sessionId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .gt('created_at', new Date(Date.now() - maxExtensionMinutes * 60 * 1000).toISOString())
    .select('expires_at')
    .single();

  if (error || !data) {
    logger.warn({ reservationId, error }, 'Failed to extend reservation');
    return null;
  }

  logger.info({ reservationId, newExpiresAt }, 'Reservation extended');
  return data.expires_at;
}
