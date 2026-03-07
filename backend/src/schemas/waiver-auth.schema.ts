import { z } from 'zod';

// Phone: strip non-digits, require exactly 10
const phoneSchema = z
  .string()
  .transform(val => val.replace(/\D/g, ''))
  .refine(val => val.length === 10, 'Phone must be exactly 10 digits');

// Lookup by email or phone
export const waiverAuthLookupSchema = z
  .object({
    email: z.string().trim().email().toLowerCase().optional(),
    phone: phoneSchema.optional(),
  })
  .refine((data) => data.email || data.phone, {
    message: 'Either email or phone is required',
  })
  .strip();

export type WaiverAuthLookupInput = z.infer<typeof waiverAuthLookupSchema>;

// Login/register waiver user
export const waiverAuthLoginSchema = z
  .object({
    email: z.string().trim().email().toLowerCase().optional(),
    phone: phoneSchema.optional(),
  })
  .refine((data) => data.email || data.phone, {
    message: 'Either email or phone is required',
  })
  .strip();

export type WaiverAuthLoginInput = z.infer<typeof waiverAuthLoginSchema>;
