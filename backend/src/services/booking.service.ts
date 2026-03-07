import { DateTime } from 'luxon';
import { randomUUID } from 'crypto';

import {
  UserRepository,
  ChildRepository,
  PartyPackageRepository,
  PartyBookingRepository,
  PartyAddOnRepository,
  PricingConfigRepository,
  StoreHoursRepository,
} from '../repositories';
import { getTaxRate, roundCurrency } from './pricing-config.service';
import { AppError } from '../utils/app-error';
import { PAYMENT_STATUS } from '../utils/payment-statuses';
import { publishAdminEvent } from './admin-events.service';

import type {
  BookingAvailabilityInput,
  BookingEstimateInput,
  BookingSlotsQuery,
  CreateBookingInput,
  CreateGuestBookingInput,
  UpdateBookingStatusInput,
} from '../schemas/booking.schema';

interface CreateBookingResult {
  bookingId: string;
  reference: string;
  total: number;
  depositAmount: number;
  balanceRemaining: number;
}

type BookingAddOnInput = { id: string; quantity?: number | undefined };

/**
 * Generate a unique booking reference.
 * Format: BK-YYYYMMDDHHmm-XXXXXXXX (8 hex chars from UUID = 32 bits of entropy)
 */
function generateBookingReference(): string {
  return `BK-${DateTime.now().toFormat('yyyyLLddHHmm')}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

const PARTY_DURATION_MINUTES = 120;
const EXTRA_HOUR_MINUTES = 60;
const CLEANING_BUFFER_MINUTES = 30;

const PARTY_LOCATIONS = ['Albany'] as const;

// Default store hours (fallback if database is empty)
// These should match what's in the database for consistency
const DEFAULT_STORE_HOURS: Record<number, { open: string; close: string }> = {
  0: { open: '11:00', close: '18:00' }, // Sunday: 11am - 6pm
  1: { open: '10:00', close: '19:00' }, // Monday: 10am - 7pm
  2: { open: '10:00', close: '19:00' }, // Tuesday: 10am - 7pm
  3: { open: '10:00', close: '19:00' }, // Wednesday: 10am - 7pm
  4: { open: '10:00', close: '19:00' }, // Thursday: 10am - 7pm
  5: { open: '10:00', close: '20:00' }, // Friday: 10am - 8pm
  6: { open: '10:00', close: '20:00' }, // Saturday: 10am - 8pm
};

// Generate 30-minute interval slots from open time to (party duration + cleaning buffer) before close
function generateSlots(open: string, close: string, partyDuration: number = PARTY_DURATION_MINUTES): string[] {
  const slots: string[] = [];
  // Handle TIME format from PostgreSQL (HH:MM:SS) by taking first 5 chars
  const openStr = open.slice(0, 5);
  const closeStr = close.slice(0, 5);
  const openParts = openStr.split(':').map(Number);
  const closeParts = closeStr.split(':').map(Number);

  const openHour = openParts[0] ?? 10;
  const openMin = openParts[1] ?? 0;
  const closeHour = closeParts[0] ?? 19;
  const closeMin = closeParts[1] ?? 0;

  // Last slot must allow full party + cleaning buffer before closing
  const closeMinutes = closeHour * 60 + closeMin;
  const lastSlotMinutes = closeMinutes - partyDuration - CLEANING_BUFFER_MINUTES;
  const lastSlotHour = Math.floor(lastSlotMinutes / 60);
  const lastSlotMin = lastSlotMinutes % 60;

  let currentHour = openHour;
  let currentMin = openMin;

  while (
    currentHour < lastSlotHour ||
    (currentHour === lastSlotHour && currentMin <= lastSlotMin)
  ) {
    slots.push(`${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`);
    currentMin += 30;
    if (currentMin >= 60) {
      currentMin -= 60;
      currentHour += 1;
    }
  }

  return slots;
}

// Helper to get slots for a specific day from database
// Falls back to default hours if database entry not found
async function getSlotsForDay(date: DateTime, location: string, partyDuration: number = PARTY_DURATION_MINUTES): Promise<string[]> {
  const dayOfWeek = date.weekday % 7; // luxon: 1=Mon, 7=Sun -> convert to 0=Sun, 1=Mon, etc.

  try {
    const storeHours = await StoreHoursRepository.findByLocationAndDay(location, dayOfWeek);

    if (storeHours && !storeHours.is_closed) {
      return generateSlots(storeHours.open_time, storeHours.close_time, partyDuration);
    }

    // Location is closed on this day
    if (storeHours?.is_closed) {
      return [];
    }
  } catch (error) {
    // Log error but continue with fallback
    console.error('Error fetching store hours from database:', error);
  }

  // Fallback to default hours
  const defaultHours = DEFAULT_STORE_HOURS[dayOfWeek];
  if (defaultHours) {
    return generateSlots(defaultHours.open, defaultHours.close, partyDuration);
  }

  // Ultimate fallback
  return ['10:00', '12:30', '15:00', '17:30'];
}

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
      type: addOn.price_type as 'flat' | 'perChild' | 'duration',
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

  if (startDateTime <= DateTime.now().setZone('America/New_York')) {
    throw new AppError('Event date must be in the future', 400);
  }

  const addOnDetails = await buildAddOnDetails(input.addOns);
  const baseDuration = (partyPackage.base_room_hours ?? 2) * 60;
  const durationMinutes =
    baseDuration + (addOnDetails.hasExtraHour ? EXTRA_HOUR_MINUTES : 0);
  const partyEndDateTime = startDateTime.plus({ minutes: durationMinutes });
  // Include cleaning time in the scheduled slot (for blocking purposes)
  const scheduledEndDateTime = partyEndDateTime.plus({ minutes: CLEANING_BUFFER_MINUTES });

  await ensureAvailability({
    location: input.location,
    start: startDateTime,
    end: scheduledEndDateTime,
  });

  const pricing = await calculateBookingPricing({
    partyPackage: {
      basePrice: partyPackage.price_usd,
      maxGuests: partyPackage.base_children,
    },
    guests: input.guests,
    extraAdults: (input as { extraAdults?: number }).extraAdults ?? 0,
    addOnDetails,
    cleaningFeeOverride: (partyPackage as any).cleaning_fee,
  });

  // Retry booking creation with new reference on unique constraint collision
  let booking: any;
  let reference: string = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    reference = generateBookingReference();
    try {
      booking = await PartyBookingRepository.create({
        package_id: partyPackage.package_id,
        customer_id: guardian.customer_id,
        scheduled_start: startDateTime.toISO(),
        scheduled_end: scheduledEndDateTime.toISO(),
        reference,
        location_name: input.location,
        event_date: startDateTime.startOf('day').toISODate() ?? undefined,
        start_time: startDateTime.toFormat('HH:mm'),
        end_time: partyEndDateTime.toFormat('HH:mm'),
        guests: input.guests,
        notes: input.notes,
        add_ons: addOnDetails.selected,
        subtotal: pricing.subtotal,
        cleaning_fee: pricing.cleaningFee,
        total: pricing.total,
        deposit_amount: pricing.depositAmount,
        balance_remaining: pricing.balanceRemaining,
        payment_status: PAYMENT_STATUS.AWAITING_DEPOSIT,
        status: 'Pending',
        child_ids: childIds,
      });
      break; // Success
    } catch (err: any) {
      if (err?.code === '23505' && attempt < 2) continue; // Unique constraint violation, retry
      throw err;
    }
  }

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
    totalAmount: b.total,
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

  // Use atomic update with status condition to prevent race conditions
  const updated = await PartyBookingRepository.updateWithCondition(
    bookingIdNum,
    { status: 'Cancelled' },
    { status: { neq: 'Cancelled' } }
  );

  if (!updated) {
    throw new AppError('Booking was already cancelled or modified', 409);
  }

  publishAdminEvent('booking.cancelled', { bookingId: booking.booking_id });

  return {
    bookingId: String(booking.booking_id),
    status: 'Cancelled',
  };
}

export async function rescheduleBooking(
  guardianId: string,
  bookingId: string,
  newEventDate: string,
  newStartTime: string,
) {
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
    throw new AppError('Cannot reschedule a cancelled booking', 400);
  }

  // Validate new date/time
  const newStart = combineDateAndTime(new Date(newEventDate), newStartTime);
  if (!newStart.isValid) {
    throw new AppError('Invalid date or time', 400);
  }

  // Check if new slot is in the future
  if (newStart <= DateTime.now().setZone('America/New_York')) {
    throw new AppError('New date must be in the future', 400);
  }

  // Calculate duration based on booking's package
  const pkg = booking.party_packages;
  const baseDuration = (pkg?.base_room_hours ?? 2) * 60;
  // Check if booking has extra hour add-on
  const addOns = (booking.add_ons ?? []) as Array<{ productName?: string }>;
  const hasExtraHour = addOns.some((a) => a.productName?.toLowerCase().includes('extra hour'));
  const totalDuration = baseDuration + (hasExtraHour ? EXTRA_HOUR_MINUTES : 0) + CLEANING_BUFFER_MINUTES;

  const newEnd = newStart.plus({ minutes: totalDuration });

  // Check availability (ignore current booking)
  const available = await isSlotAvailable({
    location: booking.location_name ?? 'Albany',
    start: newStart,
    end: newEnd,
    ignoreBookingId: bookingIdNum,
  });

  if (!available) {
    throw new AppError('The selected time slot is not available. Please choose a different time.', 400);
  }

  // Calculate new end times
  const partyEnd = newStart.plus({ minutes: baseDuration + (hasExtraHour ? EXTRA_HOUR_MINUTES : 0) });
  const scheduledEnd = partyEnd.plus({ minutes: CLEANING_BUFFER_MINUTES });

  // Update booking
  await PartyBookingRepository.update(bookingIdNum, {
    event_date: newEventDate,
    start_time: newStartTime,
    end_time: partyEnd.toFormat('HH:mm'),
    scheduled_start: newStart.toISO(),
    scheduled_end: scheduledEnd.toISO(),
  });

  publishAdminEvent('booking.rescheduled', {
    bookingId: booking.booking_id,
    oldDate: booking.event_date,
    newDate: newEventDate,
    newTime: newStartTime,
  });

  return {
    bookingId: String(booking.booking_id),
    eventDate: newEventDate,
    startTime: newStartTime,
    endTime: partyEnd.toFormat('HH:mm'),
    message: 'Booking rescheduled successfully',
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

  // Include extra hour and cleaning time in availability check
  const extraHour = input.hasExtraHour ? EXTRA_HOUR_MINUTES : 0;
  const duration = PARTY_DURATION_MINUTES + extraHour + CLEANING_BUFFER_MINUTES;
  const end = start.plus({ minutes: duration });

  const ignoreBookingId = input.ignoreBookingId ? parseInt(input.ignoreBookingId, 10) : undefined;
  const available = await isSlotAvailable({
    location: input.location,
    start,
    end,
    ignoreBookingId: (ignoreBookingId != null && !isNaN(ignoreBookingId)) ? ignoreBookingId : undefined,
  });

  return { available };
}

export async function listAvailableSlots(query: BookingSlotsQuery) {
  if (!PARTY_LOCATIONS.includes(query.location as (typeof PARTY_LOCATIONS)[number])) {
    throw new AppError('Location is not supported', 400);
  }

  // Use Eastern Time for the store location
  const ET_ZONE = 'America/New_York';
  const now = DateTime.now().setZone(ET_ZONE);
  // Parse the date as a calendar date in ET (not as a UTC timestamp)
  // This prevents midnight UTC from becoming the previous day in ET
  const isoString = query.eventDate.toISOString();
  const dateString = isoString.substring(0, 10); // Extract YYYY-MM-DD
  const date = DateTime.fromISO(dateString, { zone: ET_ZONE });
  if (!date.isValid) {
    throw new AppError('Invalid event date', 400);
  }

  // Look up package duration if packageId is provided
  let baseDuration = PARTY_DURATION_MINUTES;
  if (query.packageId) {
    const pkg = await PartyPackageRepository.findById(parseInt(query.packageId, 10));
    if (pkg) baseDuration = (pkg.base_room_hours ?? 2) * 60;
  }

  const dailySlots = await getSlotsForDay(date, query.location, baseDuration);
  const isToday = date.hasSame(now, 'day');

  const slots = await Promise.all(
    dailySlots.map(async startTime => {
      // Combine date and time in ET timezone
      const [hour, minute] = startTime.split(':').map(Number);
      const start = date.set({ hour, minute, second: 0, millisecond: 0 });

      // For today, filter out slots that have already passed
      // Require at least 30 minutes advance booking for same-day
      if (isToday) {
        const minBookingTime = now.plus({ minutes: 30 });
        if (start <= minBookingTime) {
          return {
            startTime,
            available: false,
            supportsExtraHour: false,
          };
        }
      }

      // Include cleaning time (30 min) in availability check
      const endWithCleaning = start.plus({ minutes: baseDuration + CLEANING_BUFFER_MINUTES });
      const extendedEndWithCleaning = start.plus({ minutes: baseDuration + EXTRA_HOUR_MINUTES + CLEANING_BUFFER_MINUTES });

      const available = await isSlotAvailable({ location: query.location, start, end: endWithCleaning });
      const supportsExtraHour =
        available && (await isSlotAvailable({ location: query.location, start, end: extendedEndWithCleaning }));

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
    extraAdults: (input as { extraAdults?: number }).extraAdults ?? 0,
    addOnDetails,
    cleaningFeeOverride: (partyPackage as any).cleaning_fee,
  });

  return {
    basePrice: partyPackage.price_usd,
    extraAdultCount: pricing.extraAdultCount,
    extraAdultFee: pricing.extraAdultFee,
    extraAdultTotal: pricing.extraAdultTotal,
    addOns: addOnDetails.selected,
    cleaningFee: pricing.cleaningFee,
    subtotal: pricing.subtotal,
    tax: pricing.tax,
    total: pricing.total,
    currency: 'USD',
  };
}

export async function listAllBookings() {
  // Only return bookings that have been paid (not still in cart)
  const bookings = await PartyBookingRepository.findAll({ paidOnly: true });

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
    // Partial payment tracking
    paymentOption: (b as { payment_option?: string }).payment_option || 'full',
    onlinePaymentAmount: (b as { online_payment_amount?: number }).online_payment_amount ?? b.deposit_amount ?? 0,
    venuePaymentAmount: (b as { venue_payment_amount?: number }).venue_payment_amount ?? b.balance_remaining ?? 0,
    // Guest info
    guestName: (b as { guest_name?: string }).guest_name,
    guestEmail: (b as { guest_email?: string }).guest_email,
    guestPhone: (b as { guest_phone?: string }).guest_phone,
  }));
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
    extraAdults: (booking as { extra_adults?: number }).extra_adults ?? 0,
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
    tax: pricing.tax,
    total: pricing.total,
    depositAmount: pricing.depositAmount,
    balanceRemaining: pricing.balanceRemaining,
  };
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

  const eventDate = options.start.toISODate();
  if (!eventDate) return false;

  const bookings = await PartyBookingRepository.findByLocationAndDate(
    options.location,
    eventDate,
    options.ignoreBookingId
  );

  // Note: scheduled_end already includes cleaning time (30 min buffer),
  // so we compare directly without adding extra buffers
  return bookings.every(booking => {
    if (!booking.scheduled_start || !booking.scheduled_end) {
      return true; // Skip incomplete bookings
    }

    const bookingStart = DateTime.fromISO(booking.scheduled_start);
    const bookingEnd = DateTime.fromISO(booking.scheduled_end);

    if (!bookingStart.isValid || !bookingEnd.isValid) {
      return true;
    }

    return !isOverlapping(options.start, options.end, bookingStart, bookingEnd);
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
  extraAdults: number;
  addOnDetails: { selected: { id: string; price: number; quantity: number }[] };
  cleaningFeeOverride?: number | null;
}) {
  const [globalCleaningFee, addOnDefinitions, depositPercentage, taxRate] = await Promise.all([
    getCleaningFee(),
    getAddOnDefinitions(),
    getDepositPercentage(),
    getTaxRate(),
  ]);

  // Use per-package cleaning fee if set (even if 0), otherwise use global
  const cleaningFee = params.cleaningFeeOverride != null ? params.cleaningFeeOverride : globalCleaningFee;

  const extraAdultCount = params.extraAdults;
  const extraAdultFee = addOnDefinitions['extra_adult']?.price ?? 10;
  const extraAdultTotal = extraAdultCount * extraAdultFee;

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

  const subtotal = params.partyPackage.basePrice + extraAdultTotal + addOnTotal;
  const taxableAmount = subtotal + cleaningFee;
  const tax = roundCurrency(taxableAmount * taxRate);
  const total = roundCurrency(taxableAmount + tax);
  // Full payment required - no deposits
  const depositAmount = total;
  const balanceRemaining = 0;

  return {
    subtotal,
    cleaningFee,
    tax,
    total,
    extraAdultCount,
    extraAdultFee,
    extraAdultTotal,
    depositAmount,
    balanceRemaining,
  };
}

function combineDateAndTime(date: Date, time: string) {
  const ET_ZONE = 'America/New_York';
  const eventDate = DateTime.fromJSDate(
    date instanceof Date ? date : new Date(date),
    { zone: ET_ZONE }
  );
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

/**
 * Calculate deposit amount based on payment option
 * - 'full': Pay full amount online
 * - 'split': Pay custom amount online, rest at venue (minimum $100)
 */
function calculateDepositAmount(
  total: number,
  paymentOption?: 'full' | 'split',
  customAmount?: number
): number {
  if (paymentOption === 'split' && customAmount !== undefined) {
    // Ensure minimum $100 and max total
    return Math.max(100, Math.min(total, customAmount));
  }
  // Default to full payment
  return total;
}

/**
 * Build notes field for guest booking including all children
 */
function buildGuestBookingNotes(input: CreateGuestBookingInput): string {
  const lines = [
    'GUEST BOOKING',
    `Name: ${input.guestFirstName} ${input.guestLastName}`,
    `Email: ${input.guestEmail}`,
    `Phone: ${input.guestPhone}`,
    '',
    'CHILDREN:',
    `1. ${input.childName}${input.childBirthDate ? ` (DOB: ${input.childBirthDate.toISOString().slice(0, 10)})` : ''} [Birthday Child]`,
  ];

  // Add additional children
  if (input.additionalChildren && input.additionalChildren.length > 0) {
    input.additionalChildren.forEach((child, index) => {
      lines.push(`${index + 2}. ${child.name}${child.birthDate ? ` (DOB: ${child.birthDate})` : ''}`);
    });
  }

  // Add custom notes if any
  if (input.notes) {
    lines.push('', 'NOTES:', input.notes);
  }

  return lines.join('\n').trim();
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

  if (startDateTime <= DateTime.now().setZone('America/New_York')) {
    throw new AppError('Event date must be in the future', 400);
  }

  const addOnDetails = await buildAddOnDetails(input.addOns);
  const baseDuration = (partyPackage.base_room_hours ?? 2) * 60;
  const durationMinutes =
    baseDuration + (addOnDetails.hasExtraHour ? EXTRA_HOUR_MINUTES : 0);
  const partyEndDateTime = startDateTime.plus({ minutes: durationMinutes });
  // Include cleaning time in the scheduled slot (for blocking purposes)
  const scheduledEndDateTime = partyEndDateTime.plus({ minutes: CLEANING_BUFFER_MINUTES });

  await ensureAvailability({
    location: input.location,
    start: startDateTime,
    end: scheduledEndDateTime,
  });

  const pricing = await calculateBookingPricing({
    partyPackage: {
      basePrice: partyPackage.price_usd,
      maxGuests: partyPackage.base_children,
    },
    guests: input.guests,
    extraAdults: (input as { extraAdults?: number }).extraAdults ?? 0,
    addOnDetails,
    cleaningFeeOverride: (partyPackage as any).cleaning_fee,
  });

  // Calculate payment amounts
  const onlineAmount = calculateDepositAmount(pricing.total, input.paymentOption, input.onlinePaymentAmount);
  const venueAmount = pricing.total - onlineAmount;

  // Retry guest booking creation with new reference on unique constraint collision
  let booking: any;
  let reference: string = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    reference = generateBookingReference();
    try {
      booking = await PartyBookingRepository.create({
        package_id: partyPackage.package_id,
        customer_id: null, // Guest booking - no customer account yet
        scheduled_start: startDateTime.toISO(),
        scheduled_end: scheduledEndDateTime.toISO(),
        reference,
        location_name: input.location,
        event_date: startDateTime.startOf('day').toISODate() ?? undefined,
        start_time: startDateTime.toFormat('HH:mm'),
        end_time: partyEndDateTime.toFormat('HH:mm'),
        guests: input.guests,
        notes: buildGuestBookingNotes(input),
        add_ons: addOnDetails.selected,
        subtotal: pricing.subtotal,
        cleaning_fee: pricing.cleaningFee,
        total: pricing.total,
        deposit_amount: onlineAmount,
        balance_remaining: venueAmount,
        payment_status: input.paymentOption === 'full' ? PAYMENT_STATUS.AWAITING_FULL_PAYMENT : PAYMENT_STATUS.AWAITING_DEPOSIT,
        status: 'Pending',
        child_ids: [],
        // Payment tracking fields
        payment_option: input.paymentOption || 'full',
        online_payment_amount: onlineAmount,
        venue_payment_amount: venueAmount,
        // Guest contact info (separate columns for easy admin lookup)
        guest_name: `${input.guestFirstName} ${input.guestLastName}`.trim(),
        guest_email: input.guestEmail,
        guest_phone: input.guestPhone,
      });
      break; // Success
    } catch (err: any) {
      if (err?.code === '23505' && attempt < 2) continue; // Unique constraint violation, retry
      throw err;
    }
  }

  publishAdminEvent('booking.created', {
    bookingId: booking.booking_id,
    reference,
    location: booking.location_name,
    eventDate: booking.event_date,
    startTime: booking.start_time,
    depositAmount: booking.deposit_amount,
    paymentOption: input.paymentOption || 'full',
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
