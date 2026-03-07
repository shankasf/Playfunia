import { z } from 'zod';

const nameRegex = /^[A-Za-zÀ-ÿ\s'-]+$/;

// Phone: strip non-digits, require exactly 10
const phoneSchema = z
  .string()
  .trim()
  .transform(val => val.replace(/\D/g, ''))
  .refine(val => val.length === 10, 'Phone must be exactly 10 digits');

export const submitJobApplicationSchema = z.object({
  listingId: z.coerce.number().int().positive(),
  firstName: z.string().trim().min(1, 'First name is required').max(100).regex(nameRegex, 'Name must contain only letters, spaces, hyphens, or apostrophes'),
  lastName: z.string().trim().min(1, 'Last name is required').max(100).regex(nameRegex, 'Name must contain only letters, spaces, hyphens, or apostrophes'),
  email: z.string().trim().email('Invalid email address').max(255).toLowerCase(),
  phone: phoneSchema,
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  coverLetter: z.string().trim().max(5000).optional(),
  schedulePreference: z.enum(['weekdays', 'weekends', 'evenings', 'flexible']).optional(),
  availableStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  hasExperienceWithChildren: z.preprocess(
    (val) => val === 'true' || val === true,
    z.boolean()
  ).optional(),
  gender: z.string().trim().max(50).optional(),
  pronouns: z.string().trim().max(50).optional(),
  howHeard: z.string().trim().max(200).optional(),
  emergencyContactName: z.string().trim().max(200).regex(nameRegex, 'Name must contain only letters, spaces, hyphens, or apostrophes').optional(),
  emergencyContactPhone: z.string().trim().transform(val => val.replace(/\D/g, '')).refine(val => val.length === 0 || val.length === 10, 'Phone must be 10 digits').optional(),
  videoUrl: z.string().trim().url('Please provide a valid video URL').max(2000).optional(),
});

export type SubmitJobApplicationInput = z.infer<typeof submitJobApplicationSchema>;

export const ALLOWED_RESUME_MIMETYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

export const MAX_RESUME_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export const ALLOWED_VIDEO_MIMETYPES = [
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/webm',
  'video/x-matroska',
];

export const MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024; // 100MB
