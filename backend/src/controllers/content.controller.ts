import type { Request, Response } from 'express';
import { ZodError } from 'zod';

import { appConfig } from '../config/env';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';
import {
  announcementIdParamSchema,
  faqIdParamSchema,
  testimonialIdParamSchema,
  upsertAnnouncementSchema,
  upsertFaqSchema,
  upsertTestimonialSchema,
} from '../schemas/content.schema';
import {
  createAnnouncement,
  createFaq,
  createTestimonial,
  listAnnouncements,
  listFaqs,
  listTestimonials,
  updateAnnouncement,
  updateFaq,
  updateTestimonial,
} from '../services/content.service';
import { AppError } from '../utils/app-error';
import { asyncHandler } from '../utils/async-handler';

export const listFaqsHandler = asyncHandler(async (_req: Request, res: Response) => {
  const faqs = await listFaqs();
  return res.status(200).json({ faqs });
});

export const createFaqHandler = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const payload = parseWithSchema(upsertFaqSchema, req.body);
  const faq = await createFaq(payload);
  return res.status(201).json({ faq });
});

export const updateFaqHandler = asyncHandler(async (req: Request, res: Response) => {
  const { faqId } = parseWithSchema(faqIdParamSchema, req.params);
  const payload = parseWithSchema(upsertFaqSchema, req.body);
  const faq = await updateFaq(faqId, payload);
  return res.status(200).json({ faq });
});

export const listTestimonialsHandler = asyncHandler(async (_req: Request, res: Response) => {
  const testimonials = await listTestimonials();
  return res.status(200).json({ testimonials });
});

export const createTestimonialHandler = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = parseWithSchema(upsertTestimonialSchema, req.body);
    const testimonial = await createTestimonial(payload);
    return res.status(201).json({ testimonial });
  },
);

export const updateTestimonialHandler = asyncHandler(async (req: Request, res: Response) => {
  const { testimonialId } = parseWithSchema(testimonialIdParamSchema, req.params);
  const payload = parseWithSchema(upsertTestimonialSchema, req.body);
  const testimonial = await updateTestimonial(testimonialId, payload);
  return res.status(200).json({ testimonial });
});

export const listAnnouncementsHandler = asyncHandler(async (_req: Request, res: Response) => {
  const announcements = await listAnnouncements();
  return res.status(200).json({ announcements });
});

export const createAnnouncementHandler = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = parseWithSchema(upsertAnnouncementSchema, req.body);
    const announcement = await createAnnouncement(payload);
    return res.status(201).json({ announcement });
  },
);

export const updateAnnouncementHandler = asyncHandler(async (req: Request, res: Response) => {
  const { announcementId } = parseWithSchema(announcementIdParamSchema, req.params);
  const payload = parseWithSchema(upsertAnnouncementSchema, req.body);
  const announcement = await updateAnnouncement(announcementId, payload);
  return res.status(200).json({ announcement });
});

// Instagram feed cache to avoid hitting API too frequently
let instagramCache: { posts: InstagramPost[]; fetchedAt: number } | null = null;
const INSTAGRAM_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface InstagramPost {
  id: string;
  mediaUrl: string;
  permalink: string;
  caption?: string;
  mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  timestamp: string;
}

interface InstagramApiResponse {
  data: Array<{
    id: string;
    media_url: string;
    permalink: string;
    caption?: string;
    media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
    timestamp: string;
  }>;
}

export const listInstagramPostsHandler = asyncHandler(async (_req: Request, res: Response) => {
  const { instagramAccessToken, instagramUserId } = appConfig;

  if (!instagramAccessToken || !instagramUserId) {
    return res.status(200).json({ posts: [] });
  }

  // Check cache
  if (instagramCache && Date.now() - instagramCache.fetchedAt < INSTAGRAM_CACHE_TTL) {
    return res.status(200).json({ posts: instagramCache.posts });
  }

  try {
    const fields = 'id,media_url,permalink,caption,media_type,timestamp';
    const url = `https://graph.instagram.com/${instagramUserId}/media?fields=${fields}&access_token=${instagramAccessToken}&limit=12`;

    const response = await fetch(url);
    if (!response.ok) {
      console.warn('Instagram API error:', response.status);
      return res.status(200).json({ posts: instagramCache?.posts ?? [] });
    }

    const data = (await response.json()) as InstagramApiResponse;
    const posts: InstagramPost[] = (data.data ?? []).map(item => ({
      id: item.id,
      mediaUrl: item.media_url,
      permalink: item.permalink,
      caption: item.caption ?? '',
      mediaType: item.media_type,
      timestamp: item.timestamp,
    }));

    instagramCache = { posts, fetchedAt: Date.now() };
    return res.status(200).json({ posts });
  } catch (error) {
    console.warn('Failed to fetch Instagram feed:', error);
    return res.status(200).json({ posts: instagramCache?.posts ?? [] });
  }
});

function parseWithSchema<T>(schema: { parse: (data: unknown) => T }, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const message = error.issues.map(issue => issue.message).join(', ');
      throw new AppError(`Validation failed: ${message}`, 400, { cause: error });
    }
    throw error;
  }
}
