/**
 * Email deliverability validation.
 *
 * Goal: stop hard bounces before they happen. An address is rejected when it
 *   1. is not syntactically an email address,
 *   2. uses a well-known typo of a major mail provider (gamil.com, hotmal.com…),
 *   3. has a domain with no MX (or fallback A/AAAA) record in DNS, or
 *   4. is on the AWS SES account-level suppression list (it already hard-bounced
 *      or complained), mirrored locally in `email_suppressions`.
 *
 * Checks 3 and 4 depend on the network. They FAIL OPEN: a DNS timeout or an
 * SES API error never blocks a customer; only a definitive negative answer does.
 *
 * Two entry points:
 *   - validateEmailAddress / assertDeliverableEmail — single address, used at
 *     form-submit time (waiver, contact, careers, register, bookings, checkout).
 *   - validateEmailsBulk — many addresses, used by the marketing sender. It
 *     uses the local suppression mirror (refreshed from SES when stale) instead
 *     of one SES call per recipient.
 */
import dns from 'node:dns';

import {
  GetSuppressedDestinationCommand,
  ListSuppressedDestinationsCommand,
  SESv2Client,
} from '@aws-sdk/client-sesv2';

import { appConfig } from '../config/env';
import { supabaseAny } from '../config/supabase';
import { AppError } from '../utils/app-error';
import { logger } from '../utils/logger';

export type EmailRejectReason = 'syntax' | 'typo_domain' | 'no_mx' | 'suppressed';

export type EmailValidation =
  | { ok: true; email: string }
  | { ok: false; email: string; reason: EmailRejectReason; message: string; suggestion?: string };

// ---------------------------------------------------------------------------
// 1. Syntax
// ---------------------------------------------------------------------------

// Pragmatic RFC 5322 subset: one @, sane local part, dotted domain with a
// 2+ letter TLD and no leading/trailing hyphens in labels.
const EMAIL_RE = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]{1,64}@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,24}$/;

export function normalizeEmail(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

function isSyntaxValid(email: string): boolean {
  if (!EMAIL_RE.test(email)) return false;
  const local = email.slice(0, email.lastIndexOf('@'));
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  return true;
}

// ---------------------------------------------------------------------------
// 2. Typo domains
// ---------------------------------------------------------------------------

// Misspellings we have actually seen bounce plus the usual suspects. Each maps
// to the domain the customer almost certainly meant.
const TYPO_DOMAINS: Record<string, string> = {
  // gmail
  'gamil.com': 'gmail.com', 'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmal.com': 'gmail.com',
  'gmaill.com': 'gmail.com', 'gmali.com': 'gmail.com', 'gnail.com': 'gmail.com', 'gmil.com': 'gmail.com',
  'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmail.om': 'gmail.com',
  'gmail.comm': 'gmail.com', 'gmail.cpm': 'gmail.com', 'gmail.vom': 'gmail.com', 'gmail.xom': 'gmail.com',
  'gmail.ocm': 'gmail.com', 'gmail.cmo': 'gmail.com', 'gmailc.om': 'gmail.com', 'gmail.net': 'gmail.com',
  'gmail.org': 'gmail.com', 'gemail.com': 'gmail.com', 'gimail.com': 'gmail.com', 'gmaik.com': 'gmail.com',
  'gmaol.com': 'gmail.com', 'gmsil.com': 'gmail.com', 'gmeil.com': 'gmail.com', 'ggmail.com': 'gmail.com',
  'gmail.co.m': 'gmail.com', 'gmail.coom': 'gmail.com', 'gmail.cim': 'gmail.com', 'gmail.ccom': 'gmail.com',
  // yahoo
  'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'yahoo.con': 'yahoo.com', 'yahoo.co': 'yahoo.com',
  'yahoo.cm': 'yahoo.com', 'yhoo.com': 'yahoo.com', 'yahoo.om': 'yahoo.com', 'yahoo.ocm': 'yahoo.com',
  'yahoo.cmo': 'yahoo.com', 'ymail.co': 'ymail.com', 'yahoo.comm': 'yahoo.com', 'yaoo.com': 'yahoo.com',
  // hotmail / outlook / live
  'hotmal.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotmial.com': 'hotmail.com', 'hotmil.com': 'hotmail.com',
  'hotmail.co': 'hotmail.com', 'hotmail.con': 'hotmail.com', 'hotmail.cm': 'hotmail.com', 'hotmaill.com': 'hotmail.com',
  'hotmail.om': 'hotmail.com', 'hotmail.ocm': 'hotmail.com', 'hotmail.cmo': 'hotmail.com', 'hotamil.com': 'hotmail.com',
  'hotmali.com': 'hotmail.com', 'homail.com': 'hotmail.com', 'hotnail.com': 'hotmail.com', 'hotmail.comm': 'hotmail.com',
  'outlok.com': 'outlook.com', 'outlook.con': 'outlook.com', 'outlook.co': 'outlook.com', 'outloo.com': 'outlook.com',
  'outlook.cm': 'outlook.com', 'outlookcom': 'outlook.com', 'outlook.ocm': 'outlook.com', 'oulook.com': 'outlook.com',
  'live.con': 'live.com', 'live.co': 'live.com', 'live.cm': 'live.com',
  // icloud / me / aol / comcast / att
  'iclould.com': 'icloud.com', 'icloud.con': 'icloud.com', 'icloud.co': 'icloud.com', 'icloud.cm': 'icloud.com',
  'icoud.com': 'icloud.com', 'iclod.com': 'icloud.com', 'icloud.ocm': 'icloud.com', 'icloud.comm': 'icloud.com',
  'me.con': 'me.com', 'aol.con': 'aol.com', 'aol.co': 'aol.com', 'aol.cm': 'aol.com', 'aoll.com': 'aol.com',
  'comcast.ent': 'comcast.net', 'comcast.com': 'comcast.net', 'comcast.nte': 'comcast.net', 'comcat.net': 'comcast.net',
  'att.ent': 'att.net', 'sbcglobal.ent': 'sbcglobal.net', 'verizon.ent': 'verizon.net', 'bellsouth.ent': 'bellsouth.net',
  'protonmail.con': 'protonmail.com', 'proton.m': 'proton.me',
};

// A bare TLD typo on any domain (".con" is not a TLD, ".cmo" etc.).
const BAD_TLD_RE = /\.(con|cmo|ocm|vom|xom|cpm|coom|ccom|comm|co\.m|ent|nte|ner|nett)$/;

// ---------------------------------------------------------------------------
// 3. DNS MX lookup (cached per domain)
// ---------------------------------------------------------------------------

type DnsVerdict = 'ok' | 'none' | 'unknown';
const DNS_POSITIVE_TTL_MS = 6 * 60 * 60 * 1000;
const DNS_NEGATIVE_TTL_MS = 15 * 60 * 1000;
const dnsCache = new Map<string, { verdict: DnsVerdict; expires: number }>();
const resolver = new dns.promises.Resolver({ timeout: 3000, tries: 2 });

const DEFINITIVE_DNS_ERRORS = new Set([dns.NOTFOUND, dns.NODATA, 'ENOTFOUND', 'ENODATA']);

function dnsErrorCode(err: unknown): string {
  return (err as { code?: string })?.code ?? '';
}

async function domainHasMailServer(domain: string): Promise<DnsVerdict> {
  const now = Date.now();
  const cached = dnsCache.get(domain);
  if (cached && cached.expires > now) return cached.verdict;

  let verdict: DnsVerdict = 'unknown';
  try {
    const mx = await resolver.resolveMx(domain);
    // A single "." null-MX record (RFC 7505) means the domain refuses mail.
    const usable = mx.filter((r) => r.exchange && r.exchange !== '.' && r.exchange !== '');
    verdict = usable.length > 0 ? 'ok' : 'none';
  } catch (err) {
    if (DEFINITIVE_DNS_ERRORS.has(dnsErrorCode(err))) {
      // No MX: RFC 5321 falls back to an A/AAAA record. Accept those too.
      try {
        await resolver.resolve4(domain);
        verdict = 'ok';
      } catch (err4) {
        if (DEFINITIVE_DNS_ERRORS.has(dnsErrorCode(err4))) {
          try {
            await resolver.resolve6(domain);
            verdict = 'ok';
          } catch (err6) {
            verdict = DEFINITIVE_DNS_ERRORS.has(dnsErrorCode(err6)) ? 'none' : 'unknown';
          }
        }
      }
    } else {
      logger.warn({ domain, code: dnsErrorCode(err) }, '[EmailValidation] DNS lookup inconclusive; allowing');
    }
  }

  dnsCache.set(domain, { verdict, expires: now + (verdict === 'unknown' ? DNS_NEGATIVE_TTL_MS : verdict === 'none' ? DNS_NEGATIVE_TTL_MS : DNS_POSITIVE_TTL_MS) });
  return verdict;
}

// ---------------------------------------------------------------------------
// 4. SES suppression list
// ---------------------------------------------------------------------------

let sesClient: SESv2Client | null | undefined;

function getSes(): SESv2Client | null {
  if (sesClient !== undefined) return sesClient;
  if (!appConfig.awsAccessKeyId || !appConfig.awsSecretAccessKey) {
    logger.warn('[EmailValidation] AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY not set; SES suppression check disabled');
    sesClient = null;
    return null;
  }
  sesClient = new SESv2Client({
    region: appConfig.awsRegion,
    credentials: { accessKeyId: appConfig.awsAccessKeyId, secretAccessKey: appConfig.awsSecretAccessKey },
  });
  return sesClient;
}

export function isSesValidationConfigured(): boolean {
  return !!(appConfig.awsAccessKeyId && appConfig.awsSecretAccessKey);
}

const SES_SINGLE_TTL_MS = 10 * 60 * 1000;
const sesSingleCache = new Map<string, { suppressed: boolean; expires: number }>();

/** Live single-address lookup against SES. `null` = could not determine. */
async function sesIsSuppressed(email: string): Promise<boolean | null> {
  const ses = getSes();
  if (!ses) return null;
  const now = Date.now();
  const cached = sesSingleCache.get(email);
  if (cached && cached.expires > now) return cached.suppressed;

  let suppressed: boolean | null = null;
  try {
    await ses.send(new GetSuppressedDestinationCommand({ EmailAddress: email }));
    suppressed = true;
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === 'NotFoundException') suppressed = false;
    else logger.warn({ err, email }, '[EmailValidation] SES suppression lookup failed; allowing');
  }
  if (suppressed !== null) sesSingleCache.set(email, { suppressed, expires: now + SES_SINGLE_TTL_MS });
  return suppressed;
}

const SUPPRESSION_SYNC_STALE_MS = 60 * 60 * 1000;
let lastSuppressionSync = 0;
let syncInFlight: Promise<SuppressionSyncResult> | null = null;

export type SuppressionSyncResult = { synced: number; total: number; syncedAt: string };

/**
 * Mirror the whole SES account-level suppression list into email_suppressions.
 * Idempotent (upsert). Safe to call often; callers that only need "fresh
 * enough" data should use ensureSuppressionListFresh().
 */
export async function syncSesSuppressionList(): Promise<SuppressionSyncResult> {
  if (syncInFlight) return syncInFlight;
  syncInFlight = (async () => {
    const ses = getSes();
    if (!ses) throw new AppError('AWS credentials are not configured; cannot sync the SES suppression list.', 503);

    const syncedAt = new Date().toISOString();
    let nextToken: string | undefined;
    let synced = 0;
    do {
      const page = await ses.send(new ListSuppressedDestinationsCommand({ PageSize: 100, NextToken: nextToken }));
      const rows = (page.SuppressedDestinationSummaries ?? [])
        .filter((r) => r.EmailAddress)
        .map((r) => ({
          email: r.EmailAddress!.toLowerCase(),
          reason: r.Reason ?? 'BOUNCE',
          source: 'ses',
          ses_last_update: r.LastUpdateTime ? new Date(r.LastUpdateTime).toISOString() : null,
          synced_at: syncedAt,
        }));
      if (rows.length) {
        const { error } = await supabaseAny.from('email_suppressions').upsert(rows, { onConflict: 'email' });
        if (error) throw error;
        synced += rows.length;
      }
      nextToken = page.NextToken;
    } while (nextToken);

    const { count } = await supabaseAny.from('email_suppressions').select('email', { count: 'exact', head: true });
    lastSuppressionSync = Date.now();
    logger.info({ synced, total: count ?? synced }, '[EmailValidation] SES suppression list synced');
    return { synced, total: count ?? synced, syncedAt };
  })();
  try {
    return await syncInFlight;
  } finally {
    syncInFlight = null;
  }
}

async function ensureSuppressionListFresh(): Promise<void> {
  if (!isSesValidationConfigured()) return;
  if (Date.now() - lastSuppressionSync < SUPPRESSION_SYNC_STALE_MS) return;
  if (lastSuppressionSync === 0) {
    // Process just started: trust a recent sync done by a previous process.
    const { data } = await supabaseAny
      .from('email_suppressions')
      .select('synced_at')
      .order('synced_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const last = data?.synced_at ? new Date(data.synced_at).getTime() : 0;
    if (Date.now() - last < SUPPRESSION_SYNC_STALE_MS) {
      lastSuppressionSync = last;
      return;
    }
  }
  try {
    await syncSesSuppressionList();
  } catch (err) {
    logger.warn({ err }, '[EmailValidation] SES suppression sync failed; using local mirror as-is');
  }
}

export async function getSuppressedEmailSet(): Promise<Set<string>> {
  const { data, error } = await supabaseAny.from('email_suppressions').select('email');
  if (error) {
    logger.warn({ error }, '[EmailValidation] could not read email_suppressions');
    return new Set();
  }
  return new Set((data ?? []).map((r: { email: string }) => r.email));
}

export async function listSuppressions(limit = 500) {
  const { data, error } = await supabaseAny
    .from('email_suppressions')
    .select('email, reason, source, ses_last_update, synced_at')
    .order('ses_last_update', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return { suppressions: data ?? [], lastSyncedAt: lastSuppressionSync ? new Date(lastSuppressionSync).toISOString() : null };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

type EmailRejection = Extract<EmailValidation, { ok: false }>;

function reject(email: string, reason: EmailRejectReason, message: string, suggestion?: string): EmailRejection {
  return { ok: false, email, reason, message, suggestion };
}

/** Offline checks only (syntax + typo list). Shared by single and bulk paths. */
type StaticCheck = EmailRejection | { ok: true; email: string; domain: string };

function staticCheck(email: string): StaticCheck {
  if (!isSyntaxValid(email)) {
    return reject(email, 'syntax', 'Email address is invalid. Please check it and try again.');
  }
  const domain = email.slice(email.lastIndexOf('@') + 1);
  const typoFix = TYPO_DOMAINS[domain];
  if (typoFix) {
    const suggestion = `${email.slice(0, email.lastIndexOf('@'))}@${typoFix}`;
    return reject(email, 'typo_domain', `Email address is invalid: "${domain}" looks like a typo. Did you mean ${suggestion}?`, suggestion);
  }
  if (BAD_TLD_RE.test(domain)) {
    return reject(email, 'typo_domain', `Email address is invalid: "${domain}" is not a valid email domain. Please check the ending (for example .com or .net).`);
  }
  return { ok: true, email, domain };
}

/**
 * Full validation of one address: syntax → typo domain → DNS MX → SES
 * suppression list (live lookup). Network checks fail open.
 */
export async function validateEmailAddress(raw: unknown): Promise<EmailValidation> {
  const email = normalizeEmail(raw);
  const s = staticCheck(email);
  if (!s.ok) return s;

  if ((await domainHasMailServer(s.domain)) === 'none') {
    return reject(email, 'no_mx', `Email address is invalid: "${s.domain}" cannot receive email. Please check the spelling of the domain.`);
  }

  if (await sesIsSuppressed(email)) {
    return reject(email, 'suppressed', 'Email address is invalid: messages to this address have bounced before. Please use a different email address.');
  }

  return { ok: true, email };
}

/**
 * Throws a 400 AppError with a customer-readable message when the address is
 * not deliverable. Use at form-submit time after schema validation.
 */
export async function assertDeliverableEmail(raw: unknown, fieldLabel = 'Email'): Promise<string> {
  const result = await validateEmailAddress(raw);
  if (!result.ok) {
    logger.info({ email: result.email, reason: result.reason }, '[EmailValidation] rejected form email');
    const msg = fieldLabel === 'Email' ? result.message : result.message.replace(/^Email address/, `${fieldLabel} address`);
    throw new AppError(msg, 400);
  }
  return result.email;
}

/**
 * Validate many addresses for a bulk send. Uses the local suppression mirror
 * (refreshed from SES if older than an hour) and per-domain DNS caching, so a
 * 1000-recipient audience costs a handful of DNS lookups and zero SES calls.
 */
export async function validateEmailsBulk(rawEmails: Iterable<string>): Promise<Map<string, EmailValidation>> {
  await ensureSuppressionListFresh();
  const suppressed = await getSuppressedEmailSet();

  const results = new Map<string, EmailValidation>();
  const pendingDomains = new Map<string, string[]>();

  for (const raw of rawEmails) {
    const email = normalizeEmail(raw);
    if (!email || results.has(email)) continue;
    const s = staticCheck(email);
    if (!s.ok) { results.set(email, s); continue; }
    if (suppressed.has(email)) {
      results.set(email, reject(email, 'suppressed', 'Bounced or complained before (on the SES suppression list)'));
      continue;
    }
    const list = pendingDomains.get(s.domain) ?? [];
    list.push(email);
    pendingDomains.set(s.domain, list);
  }

  // Resolve distinct domains with bounded concurrency.
  const domains = [...pendingDomains.keys()];
  const CONCURRENCY = 8;
  let idx = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, domains.length) }, async () => {
      while (idx < domains.length) {
        const domain = domains[idx++]!;
        const verdict = await domainHasMailServer(domain);
        for (const email of pendingDomains.get(domain) ?? []) {
          results.set(
            email,
            verdict === 'none'
              ? reject(email, 'no_mx', `Domain "${domain}" has no mail server (DNS MX lookup failed)`)
              : { ok: true, email },
          );
        }
      }
    }),
  );

  return results;
}

/** Short admin-facing label for a rejection reason. */
export function describeRejectReason(reason: EmailRejectReason): string {
  switch (reason) {
    case 'syntax': return 'Malformed address';
    case 'typo_domain': return 'Typo in domain';
    case 'no_mx': return 'Domain cannot receive mail';
    case 'suppressed': return 'Previously bounced';
  }
}
