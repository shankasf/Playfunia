/**
 * Slot Reservation API
 *
 * API functions for managing booking slot reservations.
 * Used with the 5-minute countdown timer during checkout.
 */

import { apiGet, apiPost } from './client';

export interface ReserveSlotRequest {
  slotDate: string; // YYYY-MM-DD
  slotTime: string; // HH:MM
  locationName: string;
  sessionId: string;
}

export interface ReserveSlotResponse {
  success: boolean;
  reservationId: string;
  expiresAt: string;
}

export interface CheckReservationResponse {
  exists: boolean;
  reservationId?: string;
  expiresAt?: string;
  status?: 'pending' | 'confirmed' | 'expired' | 'cancelled';
}

export interface ReservationDetails {
  reservationId: string;
  slotDate: string;
  slotTime: string;
  locationName: string;
  status: 'pending' | 'confirmed' | 'expired' | 'cancelled';
  expiresAt: string;
  confirmedAt: string | null;
  bookingId: number | null;
}

export interface ExtendReservationResponse {
  success: boolean;
  expiresAt: string;
}

/**
 * Generate or get existing session ID for tracking reservations
 */
export function getSessionId(): string {
  const storageKey = 'playfunia_session_id';
  let sessionId = localStorage.getItem(storageKey);

  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem(storageKey, sessionId);
  }

  return sessionId;
}

/**
 * Reserve a booking slot for 5 minutes
 */
export async function reserveSlot(
  slotDate: string,
  slotTime: string,
  locationName: string
): Promise<ReserveSlotResponse> {
  const sessionId = getSessionId();

  return apiPost<ReserveSlotResponse, ReserveSlotRequest>('/reservations', {
    slotDate,
    slotTime,
    locationName,
    sessionId,
  });
}

/**
 * Check if user already has a reservation for a slot
 */
export async function checkExistingReservation(
  slotDate: string,
  slotTime: string,
  locationName: string
): Promise<CheckReservationResponse> {
  const sessionId = getSessionId();

  const params = new URLSearchParams({
    slotDate,
    slotTime,
    locationName,
    sessionId,
  });

  return apiGet<CheckReservationResponse>(`/reservations/check?${params.toString()}`);
}

/**
 * Get reservation details by ID
 */
export async function getReservation(reservationId: string): Promise<ReservationDetails> {
  return apiGet<ReservationDetails>(`/reservations/${reservationId}`);
}

/**
 * Extend a reservation (adds 2 more minutes)
 */
export async function extendReservation(reservationId: string): Promise<ExtendReservationResponse> {
  const sessionId = getSessionId();

  return apiPost<ExtendReservationResponse, { sessionId: string }>(
    `/reservations/${reservationId}/extend`,
    { sessionId }
  );
}

/**
 * Cancel a reservation (releases the slot)
 */
export async function cancelReservation(reservationId: string): Promise<void> {
  const sessionId = getSessionId();

  await apiPost<void, { sessionId: string }>(
    `/reservations/${reservationId}/cancel`,
    { sessionId }
  );
}
