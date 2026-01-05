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

export const createBookingSchema = z.object({
  guardianId: z.string().min(1),
  childIds: z.array(z.string().min(1)).min(1),
  partyPackageId: z.string().min(1),
  location: z.string().min(1),
  eventDate: z.coerce.date(),
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
  eventDate: z.coerce.date(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  ignoreBookingId: z.string().optional(),
});

export type BookingAvailabilityInput = z.infer<typeof bookingAvailabilitySchema>;

export const bookingSlotsQuerySchema = z.object({
  location: z.string().min(1),
  eventDate: z.coerce.date(),
});

export type BookingSlotsQuery = z.infer<typeof bookingSlotsQuerySchema>;

export const bookingEstimateSchema = z.object({
  partyPackageId: z.string().min(1),
  location: z.string().min(1),
  guests: z.number().int().positive(),
  addOns: z.array(addOnSchema).optional(),
});

export type BookingEstimateInput = z.infer<typeof bookingEstimateSchema>;

export const createGuestBookingSchema = z.object({
  guestFirstName: z.string().min(1).max(100),
  guestLastName: z.string().min(1).max(100),
  guestEmail: z.string().email(),
  guestPhone: z.string().min(10).max(20),
  childName: z.string().min(1).max(100),
  childBirthDate: childBirthDateSchema.optional(),
  partyPackageId: z.string().min(1),
  location: z.string().min(1),
  eventDate: z.coerce.date(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  notes: z.string().max(500).optional(),
  guests: z.number().int().positive().max(60),
  addOns: z.array(addOnSchema).optional(),
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
