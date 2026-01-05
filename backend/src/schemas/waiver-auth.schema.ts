import { z } from 'zod';

// Lookup by email or phone
export const waiverAuthLookupSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().min(7).optional(),
  })
  .refine((data) => data.email || data.phone, {
    message: 'Either email or phone is required',
  })
  .strip();

export type WaiverAuthLookupInput = z.infer<typeof waiverAuthLookupSchema>;

// Login/register waiver user
export const waiverAuthLoginSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().min(7).optional(),
  })
  .refine((data) => data.email || data.phone, {
    message: 'Either email or phone is required',
  })
  .strip();

export type WaiverAuthLoginInput = z.infer<typeof waiverAuthLoginSchema>;
