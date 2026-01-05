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

export const upsertFaqSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  category: z.string().optional(),
  order: z.number().int().max(1000).min(0).optional(),
});

export type UpsertFaqInput = z.infer<typeof upsertFaqSchema>;

export const upsertTestimonialSchema = z.object({
  name: z.string().min(1),
  relationship: z.string().optional(),
  quote: z.string().min(1),
  rating: z.number().int().min(1).max(5).optional(),
  isFeatured: z.boolean().optional(),
});

export type UpsertTestimonialInput = z.infer<typeof upsertTestimonialSchema>;

export const upsertAnnouncementSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  publishDate: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
  isActive: z.boolean().optional(),
});

export type UpsertAnnouncementInput = z.infer<typeof upsertAnnouncementSchema>;

