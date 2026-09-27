/**
 * Voice Service Controller
 *
 * Server-to-server endpoints the Python voice_service calls while handling a
 * phone call. They are NOT user-facing: a shared secret (X-Voice-Secret ===
 * process.env.VOICE_BACKEND_SECRET) authenticates the trusted internal caller,
 * since a phone caller has no Supabase session.
 *
 * Two actions the voice agents can't (and shouldn't) do themselves:
 *   - payment-link: create a Square-hosted checkout link and SMS it, so card
 *     data never touches the voice model (keeps PCI scope inside Square).
 *   - callback: log a callback request and notify staff by SMS.
 */
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';

import { appConfig } from '../config/env';
import { getSquareClient, getSquareLocationId } from '../config/square';
import { sendMarketingSms } from '../services/sms.service';
import { AppError } from '../utils/app-error';
import { asyncHandler } from '../utils/async-handler';
import { logger } from '../utils/logger';

function toE164Us(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return phone.startsWith('+') ? phone : `+${digits}`;
}

/**
 * POST /api/voice/payment-link
 * Body: { amountCents: number, description: string, phone: string, bookingId?: string }
 * Creates a Square Quick Pay payment link and texts it to the caller.
 */
export const createVoicePaymentLinkHandler = asyncHandler(async (req: Request, res: Response) => {
  const { amountCents, description, phone, bookingId } = req.body ?? {};

  if (!Number.isInteger(amountCents) || amountCents < 50 || amountCents > 5_000_000) {
    throw new AppError('amountCents must be an integer between 50 and 5000000', 400);
  }
  if (typeof description !== 'string' || !description.trim()) {
    throw new AppError('description is required', 400);
  }
  if (typeof phone !== 'string' || phone.replace(/\D/g, '').length < 10) {
    throw new AppError('a valid phone number is required', 400);
  }

  const square = getSquareClient();
  const response = await square.checkout.paymentLinks.create({
    idempotencyKey: randomUUID(),
    quickPay: {
      name: description.slice(0, 255),
      priceMoney: { amount: BigInt(amountCents), currency: 'USD' },
      locationId: getSquareLocationId(),
    },
    checkoutOptions: appConfig.frontendUrl
      ? { redirectUrl: `${appConfig.frontendUrl}/payment-success` }
      : undefined,
  });

  const url = (response as { paymentLink?: { url?: string; id?: string } }).paymentLink?.url;
  if (!url) {
    throw new AppError('Square did not return a payment link URL', 502);
  }

  const dollars = (amountCents / 100).toFixed(2);
  const sms = await sendMarketingSms(
    toE164Us(phone),
    `Playfunia: here's your secure payment link for $${dollars}${
      description ? ` (${description})` : ''
    }: ${url}`,
  );

  logger.info({ bookingId, amountCents, smsSent: sms.success }, 'voice payment link created');
  return res.status(200).json({ success: true, url, smsSent: sms.success });
});

/**
 * POST /api/voice/callback
 * Body: { name: string, phone: string, reason: string, preferredTime?: string }
 * Logs a callback request and texts the staff line so a human follows up.
 */
export const createVoiceCallbackHandler = asyncHandler(async (req: Request, res: Response) => {
  const { name, phone, reason, preferredTime } = req.body ?? {};

  if (typeof name !== 'string' || !name.trim()) {
    throw new AppError('name is required', 400);
  }
  if (typeof phone !== 'string' || phone.replace(/\D/g, '').length < 10) {
    throw new AppError('a valid phone number is required', 400);
  }

  const staffPhone = process.env.VOICE_STAFF_PHONE;
  logger.info({ name, phone, reason, preferredTime }, 'voice callback requested');

  let staffNotified = false;
  if (staffPhone) {
    const when = preferredTime ? ` (prefers ${preferredTime})` : '';
    const sms = await sendMarketingSms(
      toE164Us(staffPhone),
      `Playfunia callback request from ${name} at ${toE164Us(phone)}${when}: ${
        reason || 'no reason given'
      }`,
    );
    staffNotified = sms.success;
  } else {
    logger.warn('VOICE_STAFF_PHONE not set — callback request logged but not texted to staff');
  }

  return res.status(200).json({ success: true, staffNotified });
});
