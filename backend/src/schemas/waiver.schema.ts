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

// Child birth date must be 0-12 years old (13-17 go in the teen section)
const childBirthDateSchema = z.coerce
  .date()
  .refine(date => !Number.isNaN(date.getTime()), 'Date is required')
  .refine(date => isNotFutureDate(date), 'Date cannot be in the future')
  .refine(date => {
    const age = calculateAge(date);
    return age >= 0 && age <= 12;
  }, 'Kids must be 0-12 years old. Add ages 13-17 in the teen section.');

// Teen birth date must be 13-17 years old; 18+ must be added as an adult
const teenBirthDateSchema = z.coerce
  .date()
  .refine(date => !Number.isNaN(date.getTime()), 'Date is required')
  .refine(date => isNotFutureDate(date), 'Date cannot be in the future')
  .refine(date => calculateAge(date) >= 13, 'Teens must be 13-17 years old. Add younger children in the kids section.')
  .refine(date => calculateAge(date) <= 17, 'Anyone 18 or older must be added as an adult and sign for themselves.');

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

const waiverTeenSchema = waiverChildSchema.extend({
  name: nameSchema.refine(val => val.length > 0, 'Teen name is required'),
  birthDate: teenBirthDateSchema,
});

// Each additional adult signs for themselves on the same device
const additionalAdultSchema = z.object({
  name: nameSchema.refine(val => val.length > 0, 'Adult name is required'),
  signatureImage: z
    .string({ message: 'Each adult must sign for themselves' })
    .regex(/^data:image\/png;base64,/, 'Each adult must sign for themselves'),
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
  children: z.array(waiverChildSchema).default([]),
  teens: z.array(waiverTeenSchema).default([]),
  additionalAdults: z.array(additionalAdultSchema).max(20, 'Too many adults on one waiver').default([]),
  // Quick re-sign flag - if true, only record visit if data unchanged
  quickResign: z.boolean().optional(),
})
  .refine(data => data.children.length + data.teens.length > 0, {
    message: 'At least one child or teen must be listed',
    path: ['children'],
  })
  .superRefine((data, ctx) => {
    // One entry per adult: the guardian can't also be listed as an additional adult
    const seen = new Set([data.guardianName.trim().toLowerCase()]);
    data.additionalAdults.forEach((adult, index) => {
      const key = adult.name.trim().toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${adult.name} is already on this waiver. Each adult is listed once and signs for themselves.`,
          path: ['additionalAdults', index, 'name'],
        });
      }
      seen.add(key);
    });
  });

export type SignWaiverInput = z.infer<typeof signWaiverSchema>;
