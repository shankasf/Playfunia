import { apiGet, apiPost, apiPatch } from './client';

export type AdditionalTerm = {
  title: string;
  description: string;
};

export type PartyPackageDto = {
  id: string;
  name: string;
  description?: string;
  durationMinutes: number;
  basePrice: number;
  maxGuests: number;
  includesFood?: boolean;
  includesDrinks?: boolean;
  includesDecor?: boolean;
  features?: string[];
  additionalTerms?: AdditionalTerm[];
  extraChildPrice?: number;
  extraAdultPrice?: number;
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
  extraAdultCount: number;
  extraAdultFee: number;
  extraAdultTotal: number;
  addOns: Array<{ id: string; price: number; quantity: number }>;
  cleaningFee: number;
  subtotal: number;
  tax: number;
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
  additionalChildren?: Array<{ name: string; birthDate?: string }>;
  partyPackageId: string;
  location: string;
  eventDate: string;
  startTime: string;
  guests: number;
  notes?: string;
  addOns?: BookingAddOnSelection[];
  paymentOption?: 'full' | 'split';
  onlinePaymentAmount?: number;
};

export type CreateBookingResponse = {
  bookingId: string;
  reference: string;
  total: number;
  depositAmount: number;
  balanceRemaining: number;
};

export async function fetchPartyPackages() {
  const response = await apiGet<{ packages: PartyPackageDto[] }>('/party-packages');
  return response.packages;
}

export async function fetchBookingSlots(params: { location: string; eventDate: string; packageId?: string }) {
  let url = `/bookings/slots?location=${encodeURIComponent(params.location)}&eventDate=${encodeURIComponent(params.eventDate)}`;
  if (params.packageId) {
    url += `&packageId=${encodeURIComponent(params.packageId)}`;
  }
  return apiGet<BookingSlotsResponse>(url);
}

export async function estimateBooking(payload: {
  partyPackageId: string;
  location: string;
  guests: number;
  extraAdults?: number;
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

export type SquareDepositResponse = {
  paymentId: string;
  amount: number;
  currency: string;
  status: string;
  balanceRemaining: number;
};

export async function processSquareDeposit(
  bookingId: string,
  sourceId: string,
  verificationToken?: string
) {
  return apiPost<SquareDepositResponse, { sourceId: string; verificationToken?: string }>(
    `/bookings/${bookingId}/deposit/square`,
    { sourceId, verificationToken }
  );
}

// Customer booking management
export type CustomerBooking = {
  id: string;
  reference: string;
  status: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  location: string;
  guests: number;
  totalAmount: number;
  depositAmount: number;
  balanceRemaining: number;
  partyPackage: {
    id: string;
    name: string;
  };
  children: Array<{
    id: string;
    firstName: string;
  }>;
  createdAt: string;
};

export async function fetchMyBookings() {
  const response = await apiGet<{ bookings: CustomerBooking[] }>('/bookings');
  return response.bookings;
}

export async function cancelMyBooking(bookingId: string) {
  return apiPatch<{ success: boolean; message: string }, Record<string, never>>(
    `/bookings/${bookingId}/cancel`,
    {} as Record<string, never>
  );
}

export async function rescheduleMyBooking(
  bookingId: string,
  eventDate: string,
  startTime: string
) {
  return apiPatch<{
    success: boolean;
    message: string;
    booking: {
      id: string;
      eventDate: string;
      startTime: string;
      endTime: string;
    };
  }, { eventDate: string; startTime: string }>(
    `/bookings/${bookingId}/reschedule`,
    { eventDate, startTime }
  );
}

// Customer ticket purchases
export type CustomerTicket = {
  id: string;
  type: string;
  quantity: number;
  total: number;
  status: string;
  createdAt: string;
  codes: Array<{ code: string; status: string; redeemedAt?: string }>;
};

export async function fetchMyTickets() {
  const response = await apiGet<{ tickets: CustomerTicket[] }>('/tickets');
  return response.tickets;
}
