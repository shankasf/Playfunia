/**
 * Global pre-send email validation for every mutating request.
 *
 * Walks the parsed JSON body and runs assertDeliverableEmail() on every
 * string value whose key is "email" or ends in "Email"/"_email" (guestEmail,
 * guardian_email, testEmail…), at any nesting depth. This is what makes the
 * check apply everywhere — public forms, the admin/employee portal, kiosk —
 * without each controller having to remember to call it.
 *
 * Exempt: routes that authenticate an EXISTING account (login, OTP, password
 * reset, Supabase profile sync, waiver kiosk lookup/login). A customer or
 * staff member whose address bounced in the past must still be able to sign
 * in; they are only stopped from entering a new bad address. The waiver
 * kiosk login validates new-user emails inside its own service instead.
 */
import type { NextFunction, Request, Response } from 'express';

import { assertDeliverableEmail } from '../services/email-validation.service';

const MUTATING = new Set(['POST', 'PUT', 'PATCH']);

const EXEMPT_PATHS = [
  '/api/webhooks',
  '/api/auth/login',
  '/api/auth/send-otp',
  '/api/auth/verify-otp',
  '/api/auth/reset-password',
  '/api/auth/sync-profile',
  '/api/waiver-auth/lookup',
  '/api/waiver-auth/login',
];

const EMAIL_KEY_RE = /^(email|.*Email|.*_email)$/;
const MAX_EMAILS_PER_REQUEST = 50;
const MAX_DEPTH = 6;

function collectEmails(value: unknown, out: Array<{ key: string; email: string }>, depth = 0): void {
  if (depth > MAX_DEPTH || out.length >= MAX_EMAILS_PER_REQUEST || value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) collectEmails(item, out, depth + 1);
    return;
  }
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (EMAIL_KEY_RE.test(key)) {
      if (typeof v === 'string' && v.trim()) out.push({ key, email: v });
    } else {
      collectEmails(v, out, depth + 1);
    }
  }
}

function labelFor(key: string): string {
  if (key === 'email') return 'Email';
  // guestEmail → "Guest email", guardian_email → "Guardian email"
  const words = key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export async function rejectInvalidEmailsInBody(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!MUTATING.has(req.method) || !req.body || typeof req.body !== 'object') return next();
    if (EXEMPT_PATHS.some((p) => req.path === p || req.path.startsWith(`${p}/`))) return next();

    const found: Array<{ key: string; email: string }> = [];
    collectEmails(req.body, found);
    const seen = new Set<string>();
    for (const { key, email } of found) {
      const norm = email.trim().toLowerCase();
      if (seen.has(norm)) continue;
      seen.add(norm);
      await assertDeliverableEmail(email, labelFor(key));
    }
    return next();
  } catch (err) {
    return next(err);
  }
}
