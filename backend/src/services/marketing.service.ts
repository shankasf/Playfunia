/**
 * Marketing Service
 * - Builds a unified, de-duplicated contact list from customers, child profiles
 *   and waivers, carrying marketing opt-in flags and children's birthday months.
 * - Birthday-by-month stats, opted-in audience building, GPT-4o copy drafting,
 *   and campaign send (SES email + Twilio SMS) with saved history.
 *
 * Policy: marketing is sent to OPTED-IN contacts only (email/SMS independently).
 */
import OpenAI from 'openai';

import { appConfig } from '../config/env';
import { supabaseAny } from '../config/supabase';
import { AppError } from '../utils/app-error';
import { logger } from '../utils/logger';
import { sendMarketingEmail } from './email.service';
import { assertDeliverableEmail, describeRejectReason, validateEmailsBulk } from './email-validation.service';
import { ensureEventImagesBucket } from './event-image.service';
import { sendMarketingSms } from './sms.service';

export type Channel = 'email' | 'sms' | 'both';

interface Contact {
  key: string;
  name: string;
  email: string | null;
  phone: string | null;
  emailOptIn: boolean;
  smsOptIn: boolean;
  birthdayMonths: Set<number>; // 1-12
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function normEmail(value: unknown): string {
  const v = String(value ?? '').trim().toLowerCase();
  return /^\S+@\S+\.\S+$/.test(v) ? v : '';
}

function normPhone(value: unknown): string {
  const d = String(value ?? '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
}

function monthOf(date: unknown): number | null {
  if (!date) return null;
  const s = String(date);
  // birth_date / DOB columns are 'YYYY-MM-DD'
  const m = s.match(/^\d{4}-(\d{2})-\d{2}/);
  if (m) {
    const month = parseInt(m[1] ?? '', 10);
    return month >= 1 && month <= 12 ? month : null;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.getUTCMonth() + 1;
}

// Build the unified contact map. Datasets are small enough to load in full.
async function buildContacts(): Promise<Contact[]> {
  const map = new Map<string, Contact>();

  function upsert(email: unknown, phone: unknown, name: string): Contact | null {
    const e = normEmail(email);
    const ph = normPhone(phone);
    const key = e || (ph ? `p:${ph}` : '');
    if (!key) return null;
    let c = map.get(key);
    if (!c) {
      c = { key, name: name.trim(), email: e || null, phone: ph || null, emailOptIn: false, smsOptIn: false, birthdayMonths: new Set() };
      map.set(key, c);
    }
    if (!c.name && name.trim()) c.name = name.trim();
    if (!c.email && e) c.email = e;
    if (!c.phone && ph) c.phone = ph;
    return c;
  }

  const [customers, children, submissions, waiverUsers, waiverChildren] = await Promise.all([
    supabaseAny.from('customers').select('customer_id, full_name, email, phone'),
    supabaseAny.from('children').select('child_id, customer_id, birth_date'),
    supabaseAny.from('waiver_submissions').select('guardian_first_name, guardian_last_name, guardian_email, guardian_phone, marketing_email_opt_in, marketing_sms_opt_in, child_ids, waiver_user_id'),
    supabaseAny.from('waiver_users').select('waiver_user_id, guardian_first_name, guardian_last_name, guardian_email, guardian_phone, marketing_opt_in'),
    supabaseAny.from('waiver_user_children').select('waiver_user_id, minor_date_of_birth'),
  ]);

  const childBirthById = new Map<number, unknown>();
  const childBirthsByCustomer = new Map<number, unknown[]>();
  for (const ch of children.data ?? []) {
    childBirthById.set(ch.child_id, ch.birth_date);
    if (ch.customer_id != null) {
      const arr = childBirthsByCustomer.get(ch.customer_id) ?? [];
      arr.push(ch.birth_date);
      childBirthsByCustomer.set(ch.customer_id, arr);
    }
  }
  const waiverChildBirthsByUser = new Map<number, unknown[]>();
  for (const wc of waiverChildren.data ?? []) {
    const arr = waiverChildBirthsByUser.get(wc.waiver_user_id) ?? [];
    arr.push(wc.minor_date_of_birth);
    waiverChildBirthsByUser.set(wc.waiver_user_id, arr);
  }

  // Customer profiles (birthdays only; no opt-in here)
  for (const cu of customers.data ?? []) {
    const c = upsert(cu.email, cu.phone, cu.full_name ?? '');
    if (!c) continue;
    for (const d of childBirthsByCustomer.get(cu.customer_id) ?? []) {
      const m = monthOf(d);
      if (m) c.birthdayMonths.add(m);
    }
  }

  // Waiver submissions (opt-in flags + birthdays)
  for (const s of submissions.data ?? []) {
    const name = `${s.guardian_first_name ?? ''} ${s.guardian_last_name ?? ''}`.trim();
    const c = upsert(s.guardian_email, s.guardian_phone, name);
    if (!c) continue;
    if (s.marketing_email_opt_in) c.emailOptIn = true;
    if (s.marketing_sms_opt_in) c.smsOptIn = true;
    for (const cid of (s.child_ids ?? []) as number[]) {
      const m = monthOf(childBirthById.get(cid));
      if (m) c.birthdayMonths.add(m);
    }
    for (const d of waiverChildBirthsByUser.get(s.waiver_user_id) ?? []) {
      const m = monthOf(d);
      if (m) c.birthdayMonths.add(m);
    }
  }

  // Legacy waiver users (single opt-in flag → treat as both channels)
  for (const u of waiverUsers.data ?? []) {
    const name = `${u.guardian_first_name ?? ''} ${u.guardian_last_name ?? ''}`.trim();
    const c = upsert(u.guardian_email, u.guardian_phone, name);
    if (!c) continue;
    if (u.marketing_opt_in) {
      c.emailOptIn = true;
      c.smsOptIn = true;
    }
    for (const d of waiverChildBirthsByUser.get(u.waiver_user_id) ?? []) {
      const m = monthOf(d);
      if (m) c.birthdayMonths.add(m);
    }
  }

  return [...map.values()];
}

export async function getBirthdayStats() {
  const contacts = await buildContacts();
  const months = MONTH_NAMES.map((label, i) => {
    const month = i + 1;
    const inMonth = contacts.filter((c) => c.birthdayMonths.has(month));
    return {
      month,
      label,
      total: inMonth.length,
      emailReachable: inMonth.filter((c) => c.emailOptIn && c.email).length,
      smsReachable: inMonth.filter((c) => c.smsOptIn && c.phone).length,
    };
  });
  return {
    months,
    totals: {
      contacts: contacts.length,
      emailOptIn: contacts.filter((c) => c.emailOptIn && c.email).length,
      smsOptIn: contacts.filter((c) => c.smsOptIn && c.phone).length,
    },
  };
}

// Opted-in audience for the given months (empty = all) split by channel.
async function buildAudience(months: number[], channel: Channel) {
  const contacts = await buildContacts();
  const monthSet = new Set(months);
  const pool = monthSet.size > 0
    ? contacts.filter((c) => [...c.birthdayMonths].some((m) => monthSet.has(m)))
    : contacts;

  const wantEmail = channel === 'email' || channel === 'both';
  const wantSms = channel === 'sms' || channel === 'both';
  const emailList = wantEmail ? pool.filter((c) => c.emailOptIn && c.email) : [];
  const smsList = wantSms ? pool.filter((c) => c.smsOptIn && c.phone) : [];
  return { emailList, smsList };
}

export async function previewAudience(months: number[], channel: Channel) {
  const { emailList, smsList } = await buildAudience(months, channel);

  // Merge into a unique-per-contact list carrying which channels reach them.
  type Row = {
    key: string; name: string; email: string | null; phone: string | null; viaEmail: boolean; viaSms: boolean;
    /** Why the email channel would be skipped for this contact (pre-send validation), or null when deliverable. */
    invalidEmail: string | null;
  };
  const map = new Map<string, Row>();
  const add = (c: Contact, via: 'email' | 'sms') => {
    let r = map.get(c.key);
    if (!r) {
      r = { key: c.key, name: c.name || '(no name)', email: c.email, phone: c.phone, viaEmail: false, viaSms: false, invalidEmail: null };
      map.set(c.key, r);
    }
    if (via === 'email') r.viaEmail = true;
    else r.viaSms = true;
  };
  for (const c of emailList) add(c, 'email');
  for (const c of smsList) add(c, 'sms');
  const recipients = [...map.values()];

  // Flag addresses that would be skipped at send time so the admin sees it
  // up front (they are deselected by default in the UI).
  let invalidEmailCount = 0;
  if (emailList.length > 0) {
    const checks = await validateEmailsBulk(emailList.map((c) => c.email!));
    for (const r of recipients) {
      if (!r.viaEmail || !r.email) continue;
      const v = checks.get(r.email.toLowerCase());
      if (v && !v.ok) {
        r.invalidEmail = describeRejectReason(v.reason);
        invalidEmailCount += 1;
      }
    }
  }

  return {
    emailCount: emailList.length,
    smsCount: smsList.length,
    uniqueCount: recipients.length,
    invalidEmailCount,
    recipients,
  };
}

let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!appConfig.openaiApiKey) {
    throw new AppError('AI drafting is unavailable: OPENAI_API_KEY is not configured.', 503);
  }
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: appConfig.openaiApiKey });
  return openaiClient;
}

export async function draftMessage(input: {
  intent: string;
  promoCodes: Array<{ code: string; description?: string | null }>;
  months: number[];
  channel: Channel;
}) {
  const client = getOpenAI();
  const promoText = input.promoCodes.length
    ? input.promoCodes.map((p) => `${p.code}${p.description ? ` (${p.description})` : ''}`).join(', ')
    : 'none';
  const monthLabel = input.months.length
    ? input.months.map((m) => MONTH_NAMES[m - 1]).filter(Boolean).join(', ')
    : '';

  const system = 'You are a marketing copywriter for Playfunia, a children\'s indoor play and birthday-party venue. Write warm, friendly, family-oriented promotional copy that is concise and on-brand. Faithfully follow the admin\'s instructions: if the admin\'s notes mention a specific offer, discount, theme, or message, include it as written. Do not fabricate offers that the admin did not ask for; only feature discounts that are present either in the attached promo code(s) or explicitly stated in the admin\'s notes.';
  const user = `Write marketing copy for an email + SMS campaign.
Audience: ${monthLabel ? `families with a child's birthday in ${monthLabel}` : 'opted-in Playfunia customers'}.
Admin's goal/notes (follow these instructions closely — if they mention a discount or specific wording, include it): ${input.intent?.trim() || '(none provided — write a general promotional message)'}
Attached promo code(s) to feature: ${promoText}
Return STRICT JSON with keys:
"subject" (email subject line, <= 60 chars),
"emailBody" (plain text, 2-4 short paragraphs, include the promo code(s) clearly if any),
"smsBody" (<= 300 chars, friendly, include the promo code(s) if any, no fake links).
No markdown, no extra keys.`;

  const resp = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  });

  let parsed: { subject?: string; emailBody?: string; smsBody?: string } = {};
  try {
    parsed = JSON.parse(resp.choices[0]?.message?.content ?? '{}');
  } catch {
    parsed = {};
  }
  return {
    subject: parsed.subject || 'A special offer from Playfunia',
    emailBody: parsed.emailBody || '',
    smsBody: parsed.smsBody || '',
  };
}

interface SendInput {
  channel: Channel;
  subject?: string;
  emailBody?: string;
  smsBody?: string;
  promoCodes: string[];
  months: number[];
  isTest: boolean;
  testEmail?: string;
  testPhone?: string;
  // Optional explicit allow-list of contact keys (email or "p:<phone>") chosen
  // in the UI. When present, only these opted-in contacts are sent to.
  selectedKeys?: string[];
  createdByUserId?: number | null;
  // Optional image shown in the EMAIL only (uploaded via uploadMarketingImage
  // or any external http(s) URL pasted by the admin). SMS is unaffected.
  emailImageUrl?: string | null;
}

// ---- Campaign email image upload -------------------------------------------
// Stored in the public `event-images` bucket under `marketing/` so email
// clients can fetch it without auth.
const MARKETING_IMAGE_BUCKET = 'event-images';
export const MARKETING_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const MARKETING_IMAGE_MIME_EXT: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

// Sniff the real format from the file's magic bytes (the multipart mimetype is
// client-supplied and cannot be trusted on its own).
function sniffImageMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 6 && (buf.subarray(0, 6).toString('latin1') === 'GIF87a' || buf.subarray(0, 6).toString('latin1') === 'GIF89a')) return 'image/gif';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

export async function uploadMarketingImage(file: { buffer: Buffer; originalname: string; mimetype: string; size: number }): Promise<string> {
  if (!file.buffer || file.buffer.length === 0) {
    throw new AppError('The uploaded image is empty.', 400);
  }
  if (file.buffer.length > MARKETING_IMAGE_MAX_BYTES) {
    throw new AppError('Image is too large. The maximum size is 5 MB.', 400);
  }
  const mime = sniffImageMime(file.buffer);
  if (!mime || !MARKETING_IMAGE_MIME_EXT[mime]) {
    throw new AppError('Unsupported image type. Upload a JPEG, PNG, WebP or GIF image.', 400);
  }

  await ensureEventImagesBucket();

  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const storagePath = `marketing/${now.getFullYear()}/${month}/${crypto.randomUUID()}.${MARKETING_IMAGE_MIME_EXT[mime]}`;

  const { error: uploadError } = await supabaseAny.storage
    .from(MARKETING_IMAGE_BUCKET)
    .upload(storagePath, file.buffer, { contentType: mime, upsert: false });
  if (uploadError) {
    logger.error({ error: uploadError }, 'Failed to upload marketing image');
    throw uploadError;
  }

  const { data: urlData } = supabaseAny.storage.from(MARKETING_IMAGE_BUCKET).getPublicUrl(storagePath);
  return urlData.publicUrl;
}

const MAX_BULK_RECIPIENTS = 1000;

export async function sendCampaign(input: SendInput) {
  const wantEmail = input.channel === 'email' || input.channel === 'both';
  const wantSms = input.channel === 'sms' || input.channel === 'both';

  if (wantEmail && (!input.subject?.trim() || !input.emailBody?.trim())) {
    throw new AppError('Email subject and body are required for email campaigns.', 400);
  }
  if (wantSms && !input.smsBody?.trim()) {
    throw new AppError('SMS body is required for SMS campaigns.', 400);
  }

  type Target = { name: string; email: string | null; phone: string | null };
  let emailTargets: Target[] = [];
  let smsTargets: Target[] = [];

  if (input.isTest) {
    if (wantEmail) {
      if (!normEmail(input.testEmail)) throw new AppError('A valid test email address is required.', 400);
      await assertDeliverableEmail(input.testEmail, 'Test email');
      emailTargets = [{ name: 'Test', email: normEmail(input.testEmail), phone: null }];
    }
    if (wantSms) {
      if (!normPhone(input.testPhone)) throw new AppError('A valid test phone number is required.', 400);
      smsTargets = [{ name: 'Test', email: null, phone: normPhone(input.testPhone) }];
    }
  } else {
    if (input.months.length === 0) {
      throw new AppError('Select at least one birthday month before sending a bulk campaign.', 400);
    }
    let { emailList, smsList } = await buildAudience(input.months, input.channel);
    // Honor the admin's per-recipient selection (deselected rows are dropped).
    // Server still only ever sees opted-in contacts, so this can only narrow.
    if (input.selectedKeys && input.selectedKeys.length > 0) {
      const keep = new Set(input.selectedKeys);
      emailList = emailList.filter((c) => keep.has(c.key));
      smsList = smsList.filter((c) => keep.has(c.key));
    }
    emailTargets = emailList.map((c) => ({ name: c.name, email: c.email, phone: c.phone }));
    smsTargets = smsList.map((c) => ({ name: c.name, email: c.email, phone: c.phone }));
    if (emailTargets.length + smsTargets.length === 0) {
      throw new AppError('No opted-in recipients selected. Select at least one recipient.', 400);
    }
    if (emailTargets.length + smsTargets.length > MAX_BULK_RECIPIENTS) {
      throw new AppError(`Audience exceeds the ${MAX_BULK_RECIPIENTS}-recipient safety limit. Narrow the segment.`, 400);
    }
  }

  // The image only applies to the email channel.
  const emailImageUrl = wantEmail ? (input.emailImageUrl?.trim() || null) : null;

  const audienceCount = new Set([
    ...emailTargets.map((t) => t.email).filter(Boolean),
    ...smsTargets.map((t) => t.phone).filter(Boolean),
  ]).size;

  const { data: campaign, error: campErr } = await supabaseAny
    .from('marketing_campaigns')
    .insert({
      created_by: input.createdByUserId ?? null,
      channel: input.channel,
      subject: input.subject ?? null,
      email_body: input.emailBody ?? null,
      sms_body: input.smsBody ?? null,
      email_image_url: emailImageUrl,
      promo_codes: input.promoCodes,
      birthday_months: input.months,
      audience_count: audienceCount,
      is_test: input.isTest,
      status: 'sent',
    })
    .select()
    .single();
  if (campErr) throw campErr;

  const recipients: Array<Record<string, unknown>> = [];
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const skippedDetails: Array<{ email: string; reason: string }> = [];

  // Pre-send validation (syntax, typo domains, DNS MX, SES suppression list).
  // Anything that fails is recorded as 'skipped' instead of being handed to
  // SES, where it would hard-bounce and hurt the sender reputation.
  const emailChecks = emailTargets.length > 0
    ? await validateEmailsBulk(emailTargets.map((t) => t.email).filter((e): e is string => !!e))
    : new Map();

  for (const t of emailTargets) {
    if (!t.email) continue;
    const check = emailChecks.get(t.email.toLowerCase());
    if (check && !check.ok) {
      skipped += 1;
      const reason = describeRejectReason(check.reason);
      skippedDetails.push({ email: t.email, reason });
      recipients.push({ campaign_id: campaign.campaign_id, name: t.name, email: t.email, phone: t.phone, channel: 'email', status: 'skipped', error: `${reason}: ${check.message}` });
      continue;
    }
    let ok = false;
    let err: string | null = null;
    try {
      ok = await sendMarketingEmail(t.email, input.subject!, input.emailBody!, { imageUrl: emailImageUrl });
      if (!ok) err = 'Email not sent (delivery returned false)';
    } catch (e) {
      err = e instanceof Error ? e.message : 'send error';
    }
    ok ? (sent += 1) : (failed += 1);
    recipients.push({ campaign_id: campaign.campaign_id, name: t.name, email: t.email, phone: t.phone, channel: 'email', status: ok ? 'sent' : 'failed', error: err });
  }

  for (const t of smsTargets) {
    if (!t.phone) continue;
    let ok = false;
    let err: string | null = null;
    try {
      const r = await sendMarketingSms(t.phone, input.smsBody!);
      ok = r.success;
      if (!ok) err = 'SMS not sent';
    } catch (e) {
      err = e instanceof Error ? e.message : 'send error';
    }
    ok ? (sent += 1) : (failed += 1);
    recipients.push({ campaign_id: campaign.campaign_id, name: t.name, email: t.email, phone: t.phone, channel: 'sms', status: ok ? 'sent' : 'failed', error: err });
  }

  if (recipients.length) {
    await supabaseAny.from('marketing_recipients').insert(recipients);
  }
  const status = failed === 0 && !(sent === 0 && skipped > 0) ? 'sent' : sent === 0 ? 'failed' : 'partial';
  await supabaseAny
    .from('marketing_campaigns')
    .update({ sent_count: sent, failed_count: failed, skipped_count: skipped, status })
    .eq('campaign_id', campaign.campaign_id);
  if (skipped > 0) logger.info({ campaignId: campaign.campaign_id, skipped, skippedDetails }, '[Marketing] skipped undeliverable addresses');

  return { campaignId: campaign.campaign_id, sent, failed, skipped, skippedDetails, audienceCount, status, isTest: input.isTest };
}

export async function listCampaigns(limit = 1000) {
  const { data, error } = await supabaseAny
    .from('marketing_campaigns')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getCampaign(campaignId: number) {
  const { data: campaign, error } = await supabaseAny
    .from('marketing_campaigns')
    .select('*')
    .eq('campaign_id', campaignId)
    .single();
  if (error || !campaign) throw new AppError('Campaign not found', 404);
  const { data: recipients } = await supabaseAny
    .from('marketing_recipients')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: true });
  return { ...campaign, recipients: recipients ?? [] };
}
