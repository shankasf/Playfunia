import { z } from 'zod';

export const faqIdParamSchema = z.object({
  faqId: z.string().min(1),
});

export const testimonialIdParamSchema = z.object({
  testimonialId: z.string().min(1),
});

export const announcementIdParamSchema = z.object({
  announcementId: z.string().min(1),
});

const nameRegex = /^[A-Za-zÀ-ÿ\s'-]+$/;

export const upsertFaqSchema = z.object({
  question: z.string().trim().min(1, 'Question is required').max(500),
  answer: z.string().trim().min(1, 'Answer is required').max(5000),
  category: z.string().trim().max(100).optional(),
  order: z.number().int().max(1000).min(0).optional(),
});

export type UpsertFaqInput = z.infer<typeof upsertFaqSchema>;

export const upsertTestimonialSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200).regex(nameRegex, 'Name must contain only letters, spaces, hyphens, or apostrophes'),
  relationship: z.string().trim().max(100).optional(),
  quote: z.string().trim().min(1, 'Quote is required').max(2000),
  rating: z.number().int().min(1).max(5).optional(),
  isFeatured: z.boolean().optional(),
});

export type UpsertTestimonialInput = z.infer<typeof upsertTestimonialSchema>;

export const upsertAnnouncementSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(300),
  body: z.string().trim().min(1, 'Body is required').max(10000),
  publishDate: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
  isActive: z.boolean().optional(),
});

export type UpsertAnnouncementInput = z.infer<typeof upsertAnnouncementSchema>;

