import { API_BASE_URL, apiGet, apiPost, getAuthToken } from './client';

export type MarketingChannel = 'email' | 'sms' | 'both';

export type BirthdayMonthStat = {
  month: number;
  label: string;
  total: number;
  emailReachable: number;
  smsReachable: number;
};

export type MarketingStats = {
  months: BirthdayMonthStat[];
  totals: { contacts: number; emailOptIn: number; smsOptIn: number };
};

export type LivePromo = {
  code: string;
  description: string | null;
  percent_off: number | null;
  amount_off_usd: number | null;
  valid_to: string | null;
  applies_to: string[];
};

export type AudienceRecipient = {
  key: string;
  name: string;
  email: string | null;
  phone: string | null;
  viaEmail: boolean;
  viaSms: boolean;
  /** Reason the email would be skipped by pre-send validation, or null if deliverable. */
  invalidEmail: string | null;
};

export type AudiencePreview = {
  emailCount: number;
  smsCount: number;
  uniqueCount: number;
  invalidEmailCount: number;
  recipients: AudienceRecipient[];
};

export type MarketingDraft = { subject: string; emailBody: string; smsBody: string };

export type CampaignResult = {
  campaignId: number;
  sent: number;
  failed: number;
  /** Addresses refused by pre-send validation (never handed to SES). */
  skipped: number;
  skippedDetails: Array<{ email: string; reason: string }>;
  audienceCount: number;
  status: string;
  isTest: boolean;
};

export type MarketingCampaign = {
  campaign_id: number;
  channel: string;
  subject: string | null;
  email_body: string | null;
  sms_body: string | null;
  email_image_url: string | null;
  promo_codes: string[];
  birthday_months: number[];
  audience_count: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  is_test: boolean;
  status: string;
  created_at: string;
};

export async function fetchMarketingStats() {
  return apiGet<MarketingStats>('/admin/marketing/stats');
}

export async function fetchLivePromos() {
  const data = await apiGet<{ promos: LivePromo[] }>('/admin/marketing/live-promos');
  return data.promos ?? [];
}

export async function previewMarketingAudience(payload: { months: number[]; channel: MarketingChannel }) {
  return apiPost<AudiencePreview, typeof payload>('/admin/marketing/audience-preview', payload);
}

export async function draftMarketingMessage(payload: {
  intent: string;
  promoCodes: Array<{ code: string; description?: string | null }>;
  months: number[];
  channel: MarketingChannel;
}) {
  return apiPost<MarketingDraft, typeof payload>('/admin/marketing/draft', payload);
}

export type SendCampaignPayload = {
  channel: MarketingChannel;
  subject?: string;
  emailBody?: string;
  smsBody?: string;
  /** Optional http(s) image shown at the top of the email (email only). */
  emailImageUrl?: string;
  promoCodes: string[];
  months: number[];
  isTest: boolean;
  testEmail?: string;
  testPhone?: string;
  selectedKeys?: string[];
};

export async function sendMarketingCampaign(payload: SendCampaignPayload) {
  return apiPost<CampaignResult, SendCampaignPayload>('/admin/marketing/send', payload);
}

export type EmailSuppression = {
  email: string;
  reason: string;
  source: string;
  ses_last_update: string | null;
  synced_at: string;
};

export async function fetchEmailSuppressions() {
  return apiGet<{ suppressions: EmailSuppression[]; lastSyncedAt: string | null }>('/admin/marketing/suppressions');
}

/** Pull the latest hard-bounce/complaint list from AWS SES into the local mirror. */
export async function syncEmailSuppressions() {
  return apiPost<{ synced: number; total: number; syncedAt: string }, Record<string, never>>('/admin/marketing/suppressions/sync', {});
}

export async function fetchMarketingCampaigns() {
  const data = await apiGet<{ campaigns: MarketingCampaign[] }>('/admin/marketing/campaigns');
  return data.campaigns ?? [];
}

/**
 * Uploads an image to embed at the top of a campaign email and returns its URL.
 * Multipart upload, so it bypasses the JSON helpers (same approach as the event
 * poster upload in ./admin).
 */
export async function uploadMarketingImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('image', file);

  const token = getAuthToken();
  const response = await fetch(`${API_BASE_URL}/admin/marketing/image`, {
    method: 'POST',
    body: formData,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    const text = await response.text();
    let message = text || 'Failed to upload image';
    try {
      const json = JSON.parse(text);
      if (json && typeof json.message === 'string' && json.message) message = json.message;
      else if (json && typeof json.error === 'string' && json.error) message = json.error;
    } catch {
      // Not JSON — use the raw text
    }
    throw new Error(message);
  }

  const data = (await response.json()) as { imageUrl?: string };
  if (!data.imageUrl) throw new Error('Upload succeeded but no image URL was returned.');
  return data.imageUrl;
}
