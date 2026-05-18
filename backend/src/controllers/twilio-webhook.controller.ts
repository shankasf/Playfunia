/**
 * Twilio Status Callback Controller
 *
 * Receives delivery-status updates from Twilio for outbound SMS.
 * Twilio POSTs application/x-www-form-urlencoded with fields including:
 *   MessageSid, MessageStatus, ErrorCode, To, From, AccountSid
 *
 * MessageStatus values: queued, sending, sent, delivered, undelivered, failed
 *
 * We update notification_queue rows by provider_message_sid (or by the
 * notificationId query param when the SID hasn't been persisted yet) so
 * carrier-level delivery failures surface as `status='failed'` instead of
 * the silent "Twilio accepted it" we'd otherwise infer from create().
 */

import type { Request, Response } from 'express';
import twilio from 'twilio';
import { appConfig } from '../config/env';
import { supabaseAny } from '../config/supabase';
import { logger } from '../utils/logger';

// Final statuses (no further updates expected for this MessageSid).
const TERMINAL_FAILURE_STATUSES = new Set(['failed', 'undelivered']);
const TERMINAL_SUCCESS_STATUSES = new Set(['delivered']);

export async function handleTwilioStatusCallback(req: Request, res: Response): Promise<void> {
  // Twilio expects the receiver to respond fast (<15s); always 200 quickly.
  // We do the DB update before responding because it's cheap, but on any
  // error path we still 200 — Twilio retries are not useful for our state
  // update (they'd just send the same MessageStatus again).

  const params = (req.body ?? {}) as Record<string, string>;
  const signature = req.headers['x-twilio-signature'] as string | undefined;

  // Validate signature using the account auth token. API key secrets do NOT
  // sign callbacks — Twilio always signs with the parent account auth token.
  if (!appConfig.twilioAuthToken) {
    logger.error('TWILIO_AUTH_TOKEN not configured — cannot verify Twilio status callback signature');
    res.status(500).send('signature verification not configured');
    return;
  }
  if (!signature) {
    logger.warn('Twilio status callback missing X-Twilio-Signature header');
    res.status(401).send('missing signature');
    return;
  }

  // Reconstruct the URL Twilio used to sign — must include any query string
  // (notificationId) and the public scheme/host as Twilio saw it.
  const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const fullUrl = `${protocol}://${host}${req.originalUrl}`;

  const isValid = twilio.validateRequest(
    appConfig.twilioAuthToken,
    signature,
    fullUrl,
    params,
  );

  if (!isValid) {
    logger.warn({ fullUrl, signature: signature.slice(0, 20) + '...' }, 'Invalid Twilio signature');
    res.status(401).send('invalid signature');
    return;
  }

  const messageSid = params.MessageSid;
  const messageStatus = params.MessageStatus;
  const errorCode = params.ErrorCode || null;

  if (!messageSid || !messageStatus) {
    logger.warn({ params }, 'Twilio status callback missing MessageSid or MessageStatus');
    res.status(400).send('missing fields');
    return;
  }

  // Locate the row. Prefer the notificationId query param (set when we
  // emitted the statusCallback URL) so the lookup works even before the
  // queue processor has persisted the SID. Fall back to provider_message_sid
  // for non-queued sends or stale rows.
  const notificationIdRaw = (req.query.notificationId ?? '') as string;
  const notificationId = notificationIdRaw ? Number(notificationIdRaw) : NaN;

  const update: Record<string, unknown> = {
    delivery_status: messageStatus,
    delivery_error_code: errorCode,
    delivery_updated_at: new Date().toISOString(),
    provider_message_sid: messageSid,
  };

  // On terminal failure, also flip the row to status='failed' and capture
  // the carrier error so it shows up in admin dashboards / queue stats.
  if (TERMINAL_FAILURE_STATUSES.has(messageStatus)) {
    update.status = 'failed';
    update.last_error = `Twilio ${messageStatus}${errorCode ? ` (code ${errorCode})` : ''}`;
  }

  try {
    const query = supabaseAny.from('notification_queue').update(update);
    const { error, data } = Number.isFinite(notificationId)
      ? await query.eq('id', notificationId).select('id')
      : await query.eq('provider_message_sid', messageSid).select('id');

    if (error) {
      logger.error({ error, messageSid, messageStatus }, 'Failed to update notification_queue from Twilio status');
    } else if (!data || data.length === 0) {
      // Not all sends are tracked (direct sends from booking/ticket flows
      // bypass the queue), so a miss is normal.
      logger.debug({ messageSid, messageStatus, notificationId }, 'No notification_queue row matched Twilio status callback');
    } else {
      logger.info({
        notificationId: data[0]?.id,
        messageSid,
        messageStatus,
        errorCode,
      }, 'Twilio delivery status recorded');
    }
  } catch (err) {
    logger.error({ err, messageSid, messageStatus }, 'Exception updating notification_queue from Twilio status');
  }

  // Always 200 — we've recorded what we could, and Twilio retrying won't
  // change the outcome for terminal statuses.
  res.status(200).send('ok');
}
