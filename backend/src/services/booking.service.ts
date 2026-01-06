import { DateTime } from 'luxon';
import { randomUUID } from 'crypto';

import {
  UserRepository,
  ChildRepository,
  PartyPackageRepository,
  PartyBookingRepository,
  PartyAddOnRepository,
  PricingConfigRepository,
} from '../repositories';
import { AppError } from '../utils/app-error';
import { publishAdminEvent } from './admin-events.service';

import type {
  BookingAvailabilityInput,
  BookingEstimateInput,
  BookingSlotsQuery,
  CreateBookingInput,
  CreateGuestBookingInput,
  UpdateBookingStatusInput,
} from '../schemas/booking.schema';
import { createBookingDepositPaymentIntent, confirmBookingDepositPayment } from './payment.service';

interface CreateBookingResult {
  bookingId: string;
  reference: string;
  total: number;
  depositAmount: number;
  balanceRemaining: number;
}

type BookingAddOnInput = { id: string; quantity?: number | undefined };

const PARTY_DURATION_MINUTES = 120;
const EXTRA_HOUR_MINUTES = 60;
const CLEANING_BUFFER_MINUTES = 30;

const PARTY_LOCATIONS = ['Albany'] as const;

const DAILY_SLOTS = ['10:00', '12:30', '15:00', '17:30'];

// Helper to get cleaning fee from database (with fallback)
async function getCleaningFee(): Promise<number> {
  return PricingConfigRepository.getValue('cleaning_fee', 50);
}

// Helper to get deposit percentage from database (with fallback to 50%)
async function getDepositPercentage(): Promise<number> {
  return PricingConfigRepository.getValue('deposit_percentage', 50);
}

// Helper to get add-on definitions from database
async function getAddOnDefinitions(): Promise<Record<string, { id: string; label: string; price: number; type: 'flat' | 'perChild' | 'duration' }>> {
  const addOns = await PartyAddOnRepository.findAll(true);
  const definitions: Record<string, { id: string; label: string; price: number; type: 'flat' | 'perChild' | 'duration' }> = {};

  for (const addOn of addOns) {
    definitions[addOn.code] = {
      id: addOn.code,
      label: addOn.label,
      price: addOn.price,
      type: addOn.price_type,
    };
  }

  return definitions;
}

export async function createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
  const guardianId = parseInt(input.guardianId, 10);
  if (isNaN(guardianId)) {
    throw new AppError('Invalid guardian ID', 400);
  }

  const guardian = await UserRepository.findById(guardianId);
  if (!guardian) {
    throw new AppError('Guardian not found', 404);
  }

  if (!guardian.customer_id) {
    throw new AppError('Guardian has no customer record', 400);
  }

  const packageId = parseInt(input.partyPackageId, 10);
  if (isNaN(packageId)) {
    throw new AppError('Invalid party package ID', 400);
  }

  const partyPackage = await PartyPackageRepository.findById(packageId);
  if (!partyPackage) {
    throw new AppError('Party package not found', 404);
  }

  if (!PARTY_LOCATIONS.includes(input.location as (typeof PARTY_LOCATIONS)[number])) {
    throw new AppError('Location is not supported', 400);
  }

  // Validate children belong to guardian
  const childIds = input.childIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
  const existingChildren = await ChildRepository.findByCustomerId(guardian.customer_id);
  const validChildIds = existingChildren.map(c => c.child_id);
  const invalidChildren = childIds.filter(id => !validChildIds.includes(id));
  
  if (invalidChildren.length > 0) {
    throw new AppError('One or more children are invalid for this guardian', 400);
  }

  const startDateTime = combineDateAndTime(input.eventDate, input.startTime);
  if (!startDateTime.isValid) {
    throw new AppError('Invalid start time', 400);
  }

  const addOnDetails = await buildAddOnDetails(input.addOns);
  const durationMinutes =
    PARTY_DURATION_MINUTES + (addOnDetails.hasExtraHour ? EXTRA_HOUR_MINUTES : 0);
  const endDateTime = startDateTime.plus({ minutes: durationMinutes });

  await ensureAvailability({
    location: input.location,
    start: startDateTime,
    end: endDateTime,
  });

  const pricing = await calculateBookingPricing({
    partyPackage: {
      basePrice: partyPackage.price_usd,
      maxGuests: partyPackage.base_children,
    },
    guests: input.guests,
    addOnDetails,
  });

  const reference = `BK-${DateTime.now().toFormat('yyyyLLddHHmm')}-${randomUUID().slice(0, 8).toUpperCase()}`;

  const booking = await PartyBookingRepository.create({
    package_id: partyPackage.package_id,
    customer_id: guardian.customer_id,
    scheduled_start: startDateTime.toISO(),
    scheduled_end: endDateTime.toISO(),
    reference,
    location_name: input.location,
    event_date: startDateTime.startOf('day').toISODate() ?? undefined,
    start_time: startDateTime.toFormat('HH:mm'),
    end_time: endDateTime.toFormat('HH:mm'),
    guests: input.guests,
    notes: input.notes,
    add_ons: addOnDetails.selected,
    subtotal: pricing.subtotal,
    cleaning_fee: pricing.cleaningFee,
    total: pricing.total,
    deposit_amount: pricing.depositAmount,
    balance_remaining: pricing.balanceRemaining,
    payment_status: 'awaiting_deposit',
    status: 'Pending',
    child_ids: childIds,
  });

  publishAdminEvent('booking.created', {
    bookingId: booking.booking_id,
    reference,
    location: booking.location_name,
    eventDate: booking.event_date,
    startTime: booking.start_time,
    depositAmount: booking.deposit_amount,
  });

  return {
    bookingId: String(booking.booking_id),
    reference: reference,
    total: booking.total ?? 0,
    depositAmount: booking.deposit_amount ?? 0,
    balanceRemaining: booking.balance_remaining ?? 0,
  };
}

export async function listBookingsForGuardian(guardianId: string) {
  const userId = parseInt(guardianId, 10);
  if (isNaN(userId)) return [];

  const user = await UserRepository.findById(userId);
  if (!user?.customer_id) return [];

  const bookings = await PartyBookingRepository.findByCustomerId(user.customer_id);
  
  // Transform to expected format
  return bookings.map(b => ({
    id: String(b.booking_id),
    reference: b.reference,
    location: b.location_name,
    eventDate: b.event_date,
    startTime: b.start_time,
    endTime: b.end_time,
    guests: b.guests,
    notes: b.notes,
    addOns: b.add_ons,
    subtotal: b.subtotal,
    cleaningFee: b.cleaning_fee,
    total: b.total,
    depositAmount: b.deposit_amount,
    balanceRemaining: b.balance_remaining,
    paymentStatus: b.payment_status,
    status: b.status,
    partyPackage: b.party_packages,
    createdAt: b.created_at,
  }));
}

export async function cancelBooking(guardianId: string, bookingId: string) {
  const userId = parseInt(guardianId, 10);
  const bookingIdNum = parseInt(bookingId, 10);
  
  if (isNaN(userId) || isNaN(bookingIdNum)) {
    throw new AppError('Invalid IDs', 400);
  }

  const user = await UserRepository.findById(userId);
  if (!user?.customer_id) {
    throw new AppError('User not found', 404);
  }

  const booking = await PartyBookingRepository.findById(bookingIdNum);
  
  if (!booking || booking.customer_id !== user.customer_id) {
    throw new AppError('Booking not found', 404);
  }

  if (booking.status === 'Cancelled') {
    throw new AppError('Booking already cancelled', 400);
  }

  await PartyBookingRepository.update(bookingIdNum, { status: 'Cancelled' });

  publishAdminEvent('booking.cancelled', { bookingId: booking.booking_id });

  return {
    bookingId: String(booking.booking_id),
    status: 'Cancelled',
  };
}

export async function checkBookingAvailability(
  guardianId: string,
  input: BookingAvailabilityInput,
) {
  const start = combineDateAndTime(input.eventDate, input.startTime);
  if (!start.isValid) {
    throw new AppError('Invalid start time', 400);
  }

  const duration = PARTY_DURATION_MINUTES;
  const end = start.plus({ minutes: duration });

  const ignoreBookingId = input.ignoreBookingId ? parseInt(input.ignoreBookingId, 10) : undefined;
  const available = await isSlotAvailable({
    location: input.location,
    start,
    end,
    ignoreBookingId: isNaN(ignoreBookingId ?? NaN) ? undefined : ignoreBookingId,
  });

  return { available };
}

export async function listAvailableSlots(query: BookingSlotsQuery) {
  if (!PARTY_LOCATIONS.includes(query.location as (typeof PARTY_LOCATIONS)[number])) {
    throw new AppError('Location is not supported', 400);
  }

  const date = DateTime.fromJSDate(query.eventDate).startOf('day');
  if (!date.isValid) {
    throw new AppError('Invalid event date', 400);
  }

  const slots = await Promise.all(
    DAILY_SLOTS.map(async startTime => {
      const start = combineDateAndTime(date.toJSDate(), startTime);
      const end = start.plus({ minutes: PARTY_DURATION_MINUTES });
      const extendedEnd = end.plus({ minutes: EXTRA_HOUR_MINUTES });

      const available = await isSlotAvailable({ location: query.location, start, end });
      const supportsExtraHour =
        available && (await isSlotAvailable({ location: query.location, start, end: extendedEnd }));

      return {
        startTime,
        available,
        supportsExtraHour,
      };
    }),
  );

  return {
    date: date.toISODate(),
    location: query.location,
    slots,
  };
}

export async function estimateBookingPrice(input: BookingEstimateInput) {
  const packageId = parseInt(input.partyPackageId, 10);
  if (isNaN(packageId)) {
    throw new AppError('Invalid party package ID', 400);
  }

  const partyPackage = await PartyPackageRepository.findById(packageId);
  if (!partyPackage) {
    throw new AppError('Party package not found', 404);
  }

  const addOnDetails = await buildAddOnDetails(input.addOns);

  const pricing = await calculateBookingPricing({
    partyPackage: {
      basePrice: partyPackage.price_usd,
      maxGuests: partyPackage.base_children,
    },
    guests: input.guests,
    addOnDetails,
  });

  return {
    basePrice: partyPackage.price_usd,
    extraGuestCount: pricing.extraGuestCount,
    extraGuestFee: pricing.extraGuestFee,
    extraGuestTotal: pricing.extraGuestTotal,
    addOns: addOnDetails.selected,
    cleaningFee: pricing.cleaningFee,
    subtotal: pricing.subtotal,
    total: pricing.total,
    currency: 'USD',
  };
}

export async function listAllBookings() {
  const bookings = await PartyBookingRepository.findAll();
  
  return bookings.map(b => ({
    id: String(b.booking_id),
    reference: b.reference,
    location: b.location_name,
    eventDate: b.event_date,
    startTime: b.start_time,
    endTime: b.end_time,
    guests: b.guests,
    notes: b.notes,
    addOns: b.add_ons,
    subtotal: b.subtotal,
    cleaningFee: b.cleaning_fee,
    total: b.total,
    depositAmount: b.deposit_amount,
    balanceRemaining: b.balance_remaining,
    paymentStatus: b.payment_status,
    status: b.status,
    partyPackage: b.party_packages,
    customer: b.customers,
    createdAt: b.created_at,
  }));
}

export async function initiateBookingDepositPayment(guardianId: string, bookingId: string) {
  return createBookingDepositPaymentIntent(guardianId, bookingId);
}

/**
 * Recalculate and update pricing for a booking that has null pricing values
 */
export async function recalculateBookingPricing(bookingId: string) {
  const bookingIdNum = parseInt(bookingId, 10);
  if (isNaN(bookingIdNum)) {
    throw new AppError('Invalid booking ID', 400);
  }

  const booking = await PartyBookingRepository.findById(bookingIdNum);
  if (!booking) {
    throw new AppError('Booking not found', 404);
  }

  const partyPackage = booking.party_packages;
  if (!partyPackage) {
    throw new AppError('Party package not found for booking', 404);
  }

  // Get price from party package - try both possible field names
  const basePrice = (partyPackage as unknown as { price_usd?: number; base_price?: number }).price_usd
    ?? (partyPackage as unknown as { base_price?: number }).base_price
    ?? 0;
  const maxGuests = (partyPackage as unknown as { base_children?: number }).base_children ?? 10;

  // Build add-on details from stored add_ons
  const addOns = (booking.add_ons ?? []) as Array<{ id: string; quantity?: number }>;
  const addOnDetails = await buildAddOnDetails(addOns);

  const pricing = await calculateBookingPricing({
    partyPackage: {
      basePrice,
      maxGuests,
    },
    guests: booking.guests ?? 10,
    addOnDetails,
  });

  // Update the booking with calculated pricing
  await PartyBookingRepository.update(bookingIdNum, {
    subtotal: pricing.subtotal,
    total: pricing.total,
    deposit_amount: pricing.depositAmount,
    balance_remaining: pricing.balanceRemaining,
  });

  return {
    bookingId: String(booking.booking_id),
    reference: booking.reference,
    basePrice,
    subtotal: pricing.subtotal,
    cleaningFee: pricing.cleaningFee,
    total: pricing.total,
    depositAmount: pricing.depositAmount,
    balanceRemaining: pricing.balanceRemaining,
  };
}

export async function completeBookingDepositPayment(
  guardianId: string,
  bookingId: string,
  paymentIntentId: string,
) {
  return confirmBookingDepositPayment(guardianId, bookingId, paymentIntentId);
}

export async function updateBookingStatus(bookingId: string, input: UpdateBookingStatusInput) {
  const bookingIdNum = parseInt(bookingId, 10);
  if (isNaN(bookingIdNum)) {
    throw new AppError('Invalid booking ID', 400);
  }

  const booking = await PartyBookingRepository.findById(bookingIdNum);
  if (!booking) {
    throw new AppError('Booking not found', 404);
  }

  await PartyBookingRepository.update(bookingIdNum, { status: input.status });

  publishAdminEvent('booking.statusUpdated', {
    bookingId: booking.booking_id,
    status: input.status,
  });

  return {
    bookingId: String(booking.booking_id),
    status: input.status,
  };
}

async function ensureAvailability(options: {
  location: string;
  start: DateTime;
  end: DateTime;
  ignoreBookingId?: number;
}) {
  const available = await isSlotAvailable(options);
  if (!available) {
    throw new AppError('Selected slot is no longer available', 400);
  }
}

async function isSlotAvailable(options: {
  location: string;
  start: DateTime;
  end: DateTime;
  ignoreBookingId?: number;
}) {
  if (!options.start.isValid || !options.end.isValid) {
    return false;
  }

  const bufferStart = options.start.minus({ minutes: CLEANING_BUFFER_MINUTES });
  const bufferEnd = options.end.plus({ minutes: CLEANING_BUFFER_MINUTES });

  const eventDate = options.start.toISODate();
  if (!eventDate) return false;

  const bookings = await PartyBookingRepository.findByLocationAndDate(
    options.location,
    eventDate,
    options.ignoreBookingId
  );

  return bookings.every(booking => {
    if (!booking.event_date || !booking.start_time || !booking.end_time) {
      return true; // Skip incomplete bookings
    }
    
    const bookingStart = combineDateAndTime(new Date(booking.event_date), booking.start_time);
    const bookingEnd = combineDateAndTime(new Date(booking.event_date), booking.end_time);
    
    if (!bookingStart.isValid || !bookingEnd.isValid) {
      return true;
    }
    
    const bookingBufferedStart = bookingStart.minus({ minutes: CLEANING_BUFFER_MINUTES });
    const bookingBufferedEnd = bookingEnd.plus({ minutes: CLEANING_BUFFER_MINUTES });
    
    return !isOverlapping(bufferStart, bufferEnd, bookingBufferedStart, bookingBufferedEnd);
  });
}

async function buildAddOnDetails(addOns?: BookingAddOnInput[]) {
  const selected: { id: string; label: string; price: number; quantity: number }[] = [];
  let hasExtraHour = false;

  if (addOns && addOns.length > 0) {
    const addOnDefinitions = await getAddOnDefinitions();
    addOns.forEach(addOn => {
      const def = addOnDefinitions[addOn.id];
      if (!def) {
        throw new AppError(`Unknown add-on: ${addOn.id}`, 400);
      }
      const quantity = addOn.quantity ?? 1;
      selected.push({ id: def.id, label: def.label, price: def.price, quantity });
      if (def.id === 'extra_hour') {
        hasExtraHour = true;
      }
    });
  }

  return { selected, hasExtraHour };
}

async function calculateBookingPricing(params: {
  partyPackage: { basePrice: number; maxGuests: number };
  guests: number;
  addOnDetails: { selected: { id: string; price: number; quantity: number }[] };
}) {
  const [cleaningFee, addOnDefinitions, depositPercentage] = await Promise.all([
    getCleaningFee(),
    getAddOnDefinitions(),
    getDepositPercentage(),
  ]);

  const extraGuestCount = Math.max(0, params.guests - params.partyPackage.maxGuests);
  const extraGuestFee = addOnDefinitions['extra_child']?.price ?? 40;
  const extraGuestTotal = extraGuestCount * extraGuestFee;

  const addOnTotal = params.addOnDetails.selected.reduce((sum, item) => {
    const def = addOnDefinitions[item.id];
    if (!def) {
      return sum;
    }

    if (def.type === 'perChild') {
      return sum + item.quantity * def.price;
    }

    return sum + def.price * item.quantity;
  }, 0);

  const subtotal = params.partyPackage.basePrice + extraGuestTotal + addOnTotal;
  const total = subtotal + cleaningFee;
  // Calculate deposit based on configurable percentage from database
  const depositCents = Math.round((total * 100 * depositPercentage) / 100);
  const depositAmount = depositCents / 100;
  const balanceRemaining = Math.max(total - depositAmount, 0);

  return {
    subtotal,
    cleaningFee,
    total,
    extraGuestCount,
    extraGuestFee,
    extraGuestTotal,
    depositAmount,
    balanceRemaining,
  };
}

function combineDateAndTime(date: Date, time: string) {
  const eventDate = DateTime.fromJSDate(date instanceof Date ? date : new Date(date));
  const [hour, minute] = time.split(':').map(Number);
  return eventDate.set({
    hour: Number.isFinite(hour) ? hour : NaN,
    minute: Number.isFinite(minute) ? minute : NaN,
    second: 0,
    millisecond: 0,
  });
}

function isOverlapping(startA: DateTime, endA: DateTime, startB: DateTime, endB: DateTime) {
  return startA < endB && startB < endA;
}

interface GuestBookingResult {
  bookingId: string;
  reference: string;
  total: number;
  depositAmount: number;
  balanceRemaining: number;
  guestEmail: string;
}

export async function createGuestBooking(input: CreateGuestBookingInput): Promise<GuestBookingResult> {
  const packageId = parseInt(input.partyPackageId, 10);
  if (isNaN(packageId)) {
    throw new AppError('Invalid party package ID', 400);
  }

  const partyPackage = await PartyPackageRepository.findById(packageId);
  if (!partyPackage) {
    throw new AppError('Party package not found', 404);
  }

  if (!PARTY_LOCATIONS.includes(input.location as (typeof PARTY_LOCATIONS)[number])) {
    throw new AppError('Location is not supported', 400);
  }

  const startDateTime = combineDateAndTime(input.eventDate, input.startTime);
  if (!startDateTime.isValid) {
    throw new AppError('Invalid start time', 400);
  }

  const addOnDetails = await buildAddOnDetails(input.addOns);
  const durationMinutes =
    PARTY_DURATION_MINUTES + (addOnDetails.hasExtraHour ? EXTRA_HOUR_MINUTES : 0);
  const endDateTime = startDateTime.plus({ minutes: durationMinutes });

  await ensureAvailability({
    location: input.location,
    start: startDateTime,
    end: endDateTime,
  });

  const pricing = await calculateBookingPricing({
    partyPackage: {
      basePrice: partyPackage.price_usd,
      maxGuests: partyPackage.base_children,
    },
    guests: input.guests,
    addOnDetails,
  });

  const reference = `BK-${DateTime.now().toFormat('yyyyLLddHHmm')}-${randomUUID().slice(0, 8).toUpperCase()}`;

  // Create booking without customer_id (guest booking)
  const booking = await PartyBookingRepository.create({
    package_id: partyPackage.package_id,
    customer_id: null, // Guest booking - no customer account yet
    scheduled_start: startDateTime.toISO(),
    scheduled_end: endDateTime.toISO(),
    reference,
    location_name: input.location,
    event_date: startDateTime.startOf('day').toISODate() ?? undefined,
    start_time: startDateTime.toFormat('HH:mm'),
    end_time: endDateTime.toFormat('HH:mm'),
    guests: input.guests,
    notes: `GUEST BOOKING\nName: ${input.guestFirstName} ${input.guestLastName}\nEmail: ${input.guestEmail}\nPhone: ${input.guestPhone}\nChild: ${input.childName}${input.childBirthDate ? ` (DOB: ${input.childBirthDate.toISOString().slice(0, 10)})` : ''}\n\n${input.notes || ''}`.trim(),
    add_ons: addOnDetails.selected,
    subtotal: pricing.subtotal,
    cleaning_fee: pricing.cleaningFee,
    total: pricing.total,
    deposit_amount: pricing.depositAmount,
    balance_remaining: pricing.balanceRemaining,
    payment_status: 'awaiting_deposit',
    status: 'Pending',
    child_ids: [],
  });

  publishAdminEvent('booking.created', {
    bookingId: booking.booking_id,
    reference,
    location: booking.location_name,
    eventDate: booking.event_date,
    startTime: booking.start_time,
    depositAmount: booking.deposit_amount,
    isGuestBooking: true,
    guestEmail: input.guestEmail,
  });

  return {
    bookingId: String(booking.booking_id),
    reference: reference,
    total: booking.total ?? 0,
    depositAmount: booking.deposit_amount ?? 0,
    balanceRemaining: booking.balance_remaining ?? 0,
    guestEmail: input.guestEmail,
  };
}
