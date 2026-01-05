import { z } from 'zod';

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

// Letters only regex (allows letters, spaces, hyphens, apostrophes for names)
const lettersOnlyRegex = /^[A-Za-zÀ-ÿ\s'-]+$/;

const nonFutureDate = z.coerce
  .date()
  .refine(date => !Number.isNaN(date.getTime()), 'Date is required')
  .refine(date => date <= new Date(), 'Date cannot be in the future');

// Guardian DOB must be 18+ years old
const guardianDobSchema = z.coerce
  .date()
  .refine(date => !Number.isNaN(date.getTime()), 'Date is required')
  .refine(date => date <= new Date(), 'Date cannot be in the future')
  .refine(date => calculateAge(date) >= 18, 'Parent/Guardian must be at least 18 years old');

// Child birth date must be 0-13 years old
const childBirthDateSchema = z.coerce
  .date()
  .refine(date => !Number.isNaN(date.getTime()), 'Date is required')
  .refine(date => date <= new Date(), 'Date cannot be in the future')
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
  name: nameSchema.refine(val => val.length > 0, 'Child name is required'),
  birthDate: childBirthDateSchema,
  gender: z.string().trim().optional(),
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
  signature: z.string().trim().min(1, 'Signature is required'),
  acceptedPolicies: z.array(z.string().min(1)).nonempty('Must accept policies'),
  expiresAt: z.coerce.date().optional(),
  marketingOptIn: z.boolean(),
  children: z.array(waiverChildSchema).min(1, 'At least one child must be listed'),
  // Quick re-sign flag - if true, only record visit if data unchanged
  quickResign: z.boolean().optional(),
});

export type SignWaiverInput = z.infer<typeof signWaiverSchema>;
