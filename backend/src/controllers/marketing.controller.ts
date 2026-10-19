import { z } from 'zod';

import * as MarketingService from '../services/marketing.service';
import { listSuppressions, syncSesSuppressionList } from '../services/email-validation.service';
import { supabaseAny } from '../config/supabase';
import { asyncHandler } from '../utils/async-handler';
import { AppError } from '../utils/app-error';
import type { SupabaseAuthenticatedRequest } from '../middleware/supabase-auth.middleware';

function parseIntParam(value: string | undefined): number {
  const parsed = parseInt(value || '', 10);
  if (Number.isNaN(parsed)) throw new AppError('Invalid ID parameter', 400);
  return parsed;
}

const channelEnum = z.enum(['email', 'sms', 'both']);
const monthsSchema = z.array(z.coerce.number().int().min(1).max(12)).max(12).default([]);

const previewSchema = z.object({ months: monthsSchema, channel: channelEnum });

const draftSchema = z.object({
  intent: z.string().max(1500).optional().default(''),
  promoCodes: z.array(z.object({ code: z.string(), description: z.string().nullish() })).max(10).default([]),
  months: monthsSchema,
  channel: channelEnum,
});

// Optional image for the email: any http(s) URL (uploaded or external).
// Empty string / null are treated as "no image".
const emailImageUrlSchema = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim() || undefined : v ?? undefined),
  z
    .string()
    .max(2000, 'Image URL must be 2000 characters or fewer')
    .refine((v) => {
      try {
        const u = new URL(v);
        return u.protocol === 'http:' || u.protocol === 'https:';
      } catch {
        return false;
      }
    }, 'Image URL must be a valid http(s) URL')
    .optional(),
);

const sendSchema = z.object({
  channel: channelEnum,
  subject: z.string().max(300).optional(),
  emailBody: z.string().max(10000).optional(),
  smsBody: z.string().max(1000).optional(),
  promoCodes: z.array(z.string().max(64)).max(20).default([]),
  months: monthsSchema,
  isTest: z.boolean().default(false),
  testEmail: z.string().max(200).optional(),
  testPhone: z.string().max(40).optional(),
  selectedKeys: z.array(z.string().max(320)).max(2000).optional(),
  emailImageUrl: emailImageUrlSchema,
});

export const getMarketingStatsHandler = asyncHandler(async (_req, res) => {
  const stats = await MarketingService.getBirthdayStats();
  return res.status(200).json(stats);
});

// Currently-live promo codes (active + within valid window + redemptions left).
export const listLivePromosHandler = asyncHandler(async (_req, res) => {
  const now = new Date().toISOString();
  const { data } = await supabaseAny.from('promotions').select('*').eq('is_active', true);
  const live = (data ?? [])
    .filter((p: Record<string, unknown>) =>
      (!p.valid_from || (p.valid_from as string) <= now)
      && (!p.valid_to || (p.valid_to as string) >= now)
      && (p.max_redemptions == null || ((p.redemptions as number) ?? 0) < (p.max_redemptions as number)))
    .map((p: Record<string, unknown>) => ({
      code: p.code,
      description: p.description ?? null,
      percent_off: p.percent_off ?? null,
      amount_off_usd: p.amount_off_usd ?? null,
      valid_to: p.valid_to ?? null,
      applies_to: p.applies_to ?? ['all'],
    }));
  return res.status(200).json({ promos: live });
});

export const previewAudienceHandler = asyncHandler(async (req, res) => {
  const { months, channel } = previewSchema.parse(req.body);
  const preview = await MarketingService.previewAudience(months, channel);
  return res.status(200).json(preview);
});

export const draftMessageHandler = asyncHandler(async (req, res) => {
  const input = draftSchema.parse(req.body);
  const draft = await MarketingService.draftMessage(input);
  return res.status(200).json(draft);
});

export const sendCampaignHandler = asyncHandler(async (req, res) => {
  // Zod errors are not AppErrors (the error middleware would answer 500), so
  // surface validation problems (e.g. a bad pasted image URL) as a readable 400.
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.join('.');
    throw new AppError(`${field ? `${field}: ` : ''}${issue?.message ?? 'Invalid request'}`, 400);
  }
  const input = parsed.data;
  const userId = (req as SupabaseAuthenticatedRequest).user?.id;
  const result = await MarketingService.sendCampaign({
    ...input,
    createdByUserId: userId ? parseInt(userId, 10) : null,
  });
  return res.status(200).json(result);
});

// Upload one image to attach to a campaign email → { imageUrl }.
export const uploadMarketingImageHandler = asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) throw new AppError('No image uploaded. Attach an image in the "image" field.', 400);
  const imageUrl = await MarketingService.uploadMarketingImage({
    buffer: file.buffer,
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
  });
  return res.status(200).json({ imageUrl });
});

// Mirror of the SES account-level suppression list (hard bounces/complaints).
export const listSuppressionsHandler = asyncHandler(async (_req, res) => {
  const result = await listSuppressions();
  return res.status(200).json(result);
});

export const syncSuppressionsHandler = asyncHandler(async (_req, res) => {
  const result = await syncSesSuppressionList();
  return res.status(200).json(result);
});

export const listCampaignsHandler = asyncHandler(async (_req, res) => {
  const campaigns = await MarketingService.listCampaigns();
  return res.status(200).json({ campaigns });
});

export const getCampaignHandler = asyncHandler(async (req, res) => {
  const id = parseIntParam(req.params.id);
  const campaign = await MarketingService.getCampaign(id);
  return res.status(200).json({ campaign });
});
