import { apiGet, apiPost } from './client';

export type PartyPackageDto = {
  id: string;
  name: string;
  description?: string;
  durationMinutes: number;
  basePrice: number;
  maxGuests: number;
};

export type BookingSlot = {
  startTime: string;
  available: boolean;
  supportsExtraHour?: boolean;
};

export type BookingSlotsResponse = {
  date: string;
  location: string;
  slots: BookingSlot[];
};

export type BookingEstimate = {
  basePrice: number;
  extraGuestCount: number;
  extraGuestFee: number;
  extraGuestTotal: number;
  addOns: Array<{ id: string; price: number; quantity: number }>;
  cleaningFee: number;
  subtotal: number;
  total: number;
  currency: string;
};

export type BookingAddOnSelection = {
  id: string;
  quantity?: number;
};

export type CreateBookingPayload = {
  childIds: string[];
  partyPackageId: string;
  location: string;
  eventDate: string;
  startTime: string;
  guests: number;
  notes?: string;
  addOns?: BookingAddOnSelection[];
};

export type CreateGuestBookingPayload = {
  guestFirstName: string;
  guestLastName: string;
  guestEmail: string;
  guestPhone: string;
  childName: string;
  childBirthDate?: string;
  partyPackageId: string;
  location: string;
  eventDate: string;
  startTime: string;
  guests: number;
  notes?: string;
  addOns?: BookingAddOnSelection[];
};

export type CreateBookingResponse = {
  bookingId: string;
  reference: string;
  total: number;
  depositAmount: number;
  balanceRemaining: number;
};

export type BookingDepositIntentResponse = {
  clientSecret: string;
  paymentIntentId?: string;
  amount: number;
  currency: string;
  mock?: boolean;
};

export type BookingDepositConfirmationResponse = {
  bookingId: string;
  depositPaidAt?: string;
  balanceRemaining: number;
  status: string;
};

export async function fetchPartyPackages() {
  const response = await apiGet<{ packages: PartyPackageDto[] }>('/party-packages');
  return response.packages;
}

export async function fetchBookingSlots(params: { location: string; eventDate: string }) {
  return apiGet<BookingSlotsResponse>(
    `/bookings/slots?location=${encodeURIComponent(params.location)}&eventDate=${encodeURIComponent(params.eventDate)}`
  );
}

export async function estimateBooking(payload: {
  partyPackageId: string;
  location: string;
  guests: number;
  addOns?: BookingAddOnSelection[];
}) {
  return apiPost<BookingEstimate, typeof payload>('/bookings/estimate', payload);
}

export async function createBooking(payload: CreateBookingPayload) {
  return apiPost<CreateBookingResponse, CreateBookingPayload>('/bookings', payload);
}

export async function createGuestBooking(payload: CreateGuestBookingPayload) {
  return apiPost<CreateBookingResponse & { guestEmail: string }, CreateGuestBookingPayload>('/bookings/guest', payload);
}

export async function createBookingDepositIntent(bookingId: string) {
  return apiPost<BookingDepositIntentResponse, Record<string, never>>(
    `/bookings/${bookingId}/deposit-intent`,
    {} as Record<string, never>
  );
}

export async function confirmBookingDeposit(bookingId: string, paymentIntentId: string) {
  return apiPost<BookingDepositConfirmationResponse, { paymentIntentId: string }>(
    `/bookings/${bookingId}/deposit/confirm`,
    { paymentIntentId }
  );
}
