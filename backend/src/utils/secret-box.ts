import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto';

import { appConfig } from '../config/env';

/**
 * Authenticated encryption for short-lived secrets that have to be readable
 * again by this server - specifically the pending-registration payload parked
 * in email_otps.registration_data, which carries the signup password because
 * supabase.auth.admin.createUser() needs the plaintext to create the account
 * once the OTP is confirmed.
 *
 * That payload used to be stored as bare JSON, so real users' passwords sat in
 * the table indefinitely. Sealing them means a database dump, a backup, or a
 * stray log of the row yields ciphertext.
 *
 * The key is derived from JWT_SECRET; there is no separate key to provision, and
 * it is already required for the auth routes to work at all.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_INFO = 'playfunia:otp-registration:v1';

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;

  const secret = appConfig.jwtSecret;
  if (!secret) {
    throw new Error('JWT_SECRET is required to seal pending registration data');
  }

  cachedKey = Buffer.from(
    hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.alloc(0), KEY_INFO, 32),
  );
  return cachedKey;
}

/** Encrypt a JSON-serialisable value. Returns base64 of iv || tag || ciphertext. */
export function seal(value: unknown): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

/**
 * Reverse of `seal`. Returns null rather than throwing when the input is
 * missing, truncated, or fails its authentication tag, so a bad row is treated
 * as "no registration data" instead of taking the request down.
 */
export function open<T>(sealed: string | null | undefined): T | null {
  if (!sealed) return null;

  try {
    const raw = Buffer.from(sealed, 'base64');
    if (raw.length <= IV_BYTES + TAG_BYTES) return null;

    const decipher = createDecipheriv(ALGORITHM, key(), raw.subarray(0, IV_BYTES));
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));

    const plaintext = Buffer.concat([
      decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8');

    return JSON.parse(plaintext) as T;
  } catch {
    return null;
  }
}
