import { z } from "zod";

// Helper to calculate age from birth date
const calculateAge = (birthDate: Date): number => {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

// Child birth date must be 0-13 years old
const childBirthDateSchema = z.coerce
  .date()
  .refine(date => !Number.isNaN(date.getTime()), 'Date is required')
  .refine(date => date <= new Date(), 'Date cannot be in the future')
  .refine(date => {
    const age = calculateAge(date);
    return age >= 0 && age <= 13;
  }, 'Child age must be between 0 and 13 years');

const addOnSchema = z.object({
  id: z.string().min(1),
  quantity: z.number().int().positive().max(10).optional(),
});

// Event date must be today or in the future (start of day comparison)
const futureDateSchema = z.coerce.date().refine(
  (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date >= today;
  },
  'Event date must be today or in the future'
);

export const createBookingSchema = z.object({
  guardianId: z.string().min(1),
  childIds: z.array(z.string().min(1)).min(1),
  partyPackageId: z.string().min(1),
  location: z.string().min(1),
  eventDate: futureDateSchema,
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  notes: z.string().max(500).optional(),
  guests: z.number().int().positive().max(60),
  addOns: z.array(addOnSchema).optional(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const bookingIdParamSchema = z.object({
  bookingId: z.string().min(1),
});

export const bookingAvailabilitySchema = z.object({
  location: z.string().min(1),
  eventDate: futureDateSchema,
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  ignoreBookingId: z.string().optional(),
  hasExtraHour: z.boolean().optional(),
});

export type BookingAvailabilityInput = z.infer<typeof bookingAvailabilitySchema>;

export const bookingSlotsQuerySchema = z.object({
  location: z.string().min(1),
  eventDate: futureDateSchema,
  packageId: z.string().optional(),
});

export type BookingSlotsQuery = z.infer<typeof bookingSlotsQuerySchema>;

export const bookingEstimateSchema = z.object({
  partyPackageId: z.string().min(1),
  location: z.string().min(1),
  guests: z.number().int().positive().max(60),
  extraAdults: z.number().int().min(0).optional(),
  addOns: z.array(addOnSchema).optional(),
});

export type BookingEstimateInput = z.infer<typeof bookingEstimateSchema>;

const additionalChildSchema = z.object({
  name: z.string().trim().min(1).max(100).regex(/^[A-Za-zÀ-ÿ\s'-]+$/, 'Name must contain only letters'),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format').optional(),
});

export const createGuestBookingSchema = z.object({
  guestFirstName: z.string().min(1).max(100).regex(/^[A-Za-zÀ-ÿ\s'-]+$/, 'Name must contain only letters'),
  guestLastName: z.string().min(1).max(100).regex(/^[A-Za-zÀ-ÿ\s'-]+$/, 'Name must contain only letters'),
  guestEmail: z.string().trim().email().toLowerCase(),
  guestPhone: z.string().transform(val => val.replace(/\D/g, '')).refine(val => val.length === 10, 'Phone must be exactly 10 digits'),
  childName: z.string().min(1).max(100).regex(/^[A-Za-zÀ-ÿ\s'-]+$/, 'Name must contain only letters'),
  childBirthDate: childBirthDateSchema.optional(),
  additionalChildren: z.array(additionalChildSchema).max(10).optional(),
  partyPackageId: z.string().min(1),
  location: z.string().min(1),
  eventDate: futureDateSchema,
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  notes: z.string().max(500).optional(),
  guests: z.number().int().positive().max(60),
  addOns: z.array(addOnSchema).optional(),
  paymentOption: z.enum(['full', 'split']).optional(),
  onlinePaymentAmount: z.number().positive().max(1000).optional(),
});

export type CreateGuestBookingInput = z.infer<typeof createGuestBookingSchema>;

export const updateBookingStatusSchema = z.object({
  status: z.enum(["Pending", "Confirmed", "Cancelled"]),
});

export type UpdateBookingStatusInput = z.infer<typeof updateBookingStatusSchema>;

export const bookingDepositConfirmSchema = z.object({
  paymentIntentId: z.string().min(1),
});

export type BookingDepositConfirmInput = z.infer<typeof bookingDepositConfirmSchema>;

export const rescheduleBookingSchema = z.object({
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format').refine(
    (dateStr) => {
      const date = new Date(dateStr + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return date >= today;
    },
    'Event date must be today or in the future'
  ),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format'),
});

export type RescheduleBookingInput = z.infer<typeof rescheduleBookingSchema>;
