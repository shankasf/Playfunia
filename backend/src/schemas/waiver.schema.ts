import { z } from 'zod';

// Get current date in New York timezone
const getNewYorkDate = (): { year: number; month: number; day: number } => {
  const nyDate = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = nyDate.split('/').map(Number);
  const month = parts[0] ?? 1;
  const day = parts[1] ?? 1;
  const year = parts[2] ?? 2024;
  return { year, month: month - 1, day }; // month is 0-indexed for consistency
};

// Helper to calculate age from birth date using New York timezone
const calculateAge = (birthDate: Date): number => {
  const today = getNewYorkDate();
  let age = today.year - birthDate.getFullYear();
  const monthDiff = today.month - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.day < birthDate.getDate())) {
    age--;
  }
  return age;
};

// Check if date is not in the future (New York timezone)
const isNotFutureDate = (date: Date): boolean => {
  const today = getNewYorkDate();
  const todayDate = new Date(today.year, today.month, today.day, 23, 59, 59, 999);
  return date <= todayDate;
};

// Letters only regex (allows letters, spaces, hyphens, apostrophes for names)
const lettersOnlyRegex = /^[A-Za-zÀ-ÿ\s'-]+$/;

const nonFutureDate = z.coerce
  .date()
  .refine(date => !Number.isNaN(date.getTime()), 'Date is required')
  .refine(date => isNotFutureDate(date), 'Date cannot be in the future');

// Guardian DOB must be 18+ years old
const guardianDobSchema = z.coerce
  .date()
  .refine(date => !Number.isNaN(date.getTime()), 'Date is required')
  .refine(date => isNotFutureDate(date), 'Date cannot be in the future')
  .refine(date => calculateAge(date) >= 18, 'Parent/Guardian must be at least 18 years old');

// Child birth date must be 0-13 years old
const childBirthDateSchema = z.coerce
  .date()
  .refine(date => !Number.isNaN(date.getTime()), 'Date is required')
  .refine(date => isNotFutureDate(date), 'Date cannot be in the future')
  .refine(date => {
    const age = calculateAge(date);
    return age >= 0 && age <= 13;
  }, 'Child age must be between 0 and 13 years');

// Phone must be exactly 10 digits
const phoneSchema = z
  .string()
  .transform(val => val.replace(/\D/g, '')) // Strip non-digits
  .refine(val => val.length === 10, 'Phone number must be exactly 10 digits');

// Relationship options
const relationshipOptions = ['Father', 'Mother', 'Other'] as const;

// Name schema - letters only
const nameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .refine(val => lettersOnlyRegex.test(val), 'Name must contain only letters, spaces, hyphens, or apostrophes');

const waiverChildSchema = z.object({
  childId: z.number().optional(), // Database child_id for updates
  name: nameSchema.refine(val => val.length > 0, 'Child name is required'),
  birthDate: childBirthDateSchema,
  gender: z.preprocess(
    (val) => (val == null ? '' : val),
    z.enum(['Male', 'Female', 'Non-binary', 'Other', ''])
  ).optional(),
});

export const signWaiverSchema = z.object({
  guardianId: z.string().min(1),
  guardianName: nameSchema.refine(val => val.length > 0, 'Guardian name is required'),
  guardianEmail: z.string().trim().email('Valid email is required'),
  guardianPhone: phoneSchema,
  guardianDob: guardianDobSchema,
  relationshipToChildren: z.enum(relationshipOptions, {
    message: 'Relationship must be Father, Mother, or Other',
  }),
  signature: z.string().trim().min(1, 'Signature is required').max(200, 'Signature is too long'),
  signatureImage: z.string().optional(),
  acceptedPolicies: z.array(z.string().min(1)).nonempty('Must accept policies'),
  expiresAt: z.coerce.date().optional(),
  marketingOptIn: z.boolean(),
  children: z.array(waiverChildSchema).min(1, 'At least one child must be listed'),
  // Quick re-sign flag - if true, only record visit if data unchanged
  quickResign: z.boolean().optional(),
});

export type SignWaiverInput = z.infer<typeof signWaiverSchema>;
