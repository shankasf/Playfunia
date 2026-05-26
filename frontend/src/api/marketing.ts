import { apiGet, apiPost } from './client';

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

export type AudiencePreview = {
  emailCount: number;
  smsCount: number;
  uniqueCount: number;
  sample: Array<{ name: string; email: string | null; phone: string | null }>;
};

export type MarketingDraft = { subject: string; emailBody: string; smsBody: string };

export type CampaignResult = {
  campaignId: number;
  sent: number;
  failed: number;
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
  promo_codes: string[];
  birthday_months: number[];
  audience_count: number;
  sent_count: number;
  failed_count: number;
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
  promoCodes: string[];
  months: number[];
  isTest: boolean;
  testEmail?: string;
  testPhone?: string;
};

export async function sendMarketingCampaign(payload: SendCampaignPayload) {
  return apiPost<CampaignResult, SendCampaignPayload>('/admin/marketing/send', payload);
}

export async function fetchMarketingCampaigns() {
  const data = await apiGet<{ campaigns: MarketingCampaign[] }>('/admin/marketing/campaigns');
  return data.campaigns ?? [];
}
