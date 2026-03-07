/**
 * Square Webhook Controller
 *
 * Handles incoming Square webhook events.
 * - Verifies signature before processing
 * - Returns 200 immediately to prevent timeout
 * - Processes events idempotently in background
 */

import type { Request, Response } from 'express';
import { appConfig } from '../config/env';
import { logger } from '../utils/logger';
import {
  verifyWebhookSignature,
  isEventProcessed,
  storeWebhookEvent,
  processWebhookEvent,
  SquareWebhookPayload,
} from '../services/webhook.service';

// Square webhook signature key from centralized config (Fix #5)
const WEBHOOK_SIGNATURE_KEY = appConfig.squareWebhookSignatureKey ?? '';

/**
 * Handle Square webhook requests.
 *
 * This endpoint:
 * 1. Validates the signature
 * 2. Responds with 200 immediately (Square requires response in <2 seconds)
 * 3. Processes the event asynchronously
 */
export async function handleSquareWebhook(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();

  // Get signature from header
  const signature = req.headers['x-square-hmacsha256-signature'] as string;
  const contentType = req.headers['content-type'];

  // Log incoming webhook
  logger.info({
    signature: signature ? 'present' : 'missing',
    contentType,
    bodyLength: req.body ? JSON.stringify(req.body).length : 0,
  }, 'Received Square webhook');

  // Get raw body for signature verification (Fix #1)
  // CRITICAL: Never fall back to JSON.stringify - it will produce different output
  // and break signature verification
  const rawBody = (req as Request & { rawBody?: string }).rawBody;

  // Signature verification (Fix #6 - require in all environments with explicit warning)
  if (!WEBHOOK_SIGNATURE_KEY) {
    if (appConfig.nodeEnv !== 'development') {
      logger.error('SQUARE_WEBHOOK_SIGNATURE_KEY not configured');
      res.status(500).json({ error: 'Webhook signature verification not configured' });
      return;
    }
    logger.warn('DEV ONLY: Webhook signature verification disabled');
  } else {
    // Validate that we have the raw body (Fix #1)
    if (!rawBody) {
      logger.error('Raw body not captured for webhook - signature verification impossible');
      res.status(400).json({ error: 'Invalid request: raw body not available' });
      return;
    }

    // Reconstruct the webhook URL for signature verification
    // Use x-forwarded-proto from reverse proxy (Caddy) to get the actual protocol
    const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol;
    const webhookUrl = `${protocol}://${req.get('host')}${req.originalUrl}`;

    const isValid = verifyWebhookSignature(
      signature,
      webhookUrl,
      rawBody,
      WEBHOOK_SIGNATURE_KEY
    );

    if (!isValid) {
      logger.warn({
        signature: signature?.substring(0, 20) + '...',
        webhookUrl,
        bodyLength: rawBody.length,
      }, 'Invalid webhook signature');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }
  }

  // Parse payload
  const payload = req.body as SquareWebhookPayload;

  if (!payload.event_id || !payload.type) {
    logger.warn('Invalid webhook payload - missing event_id or type');
    res.status(400).json({ error: 'Invalid payload' });
    return;
  }

  const eventId = payload.event_id;
  const eventType = payload.type;

  // Check if already processed (idempotency)
  const alreadyProcessed = await isEventProcessed(eventId);
  if (alreadyProcessed) {
    logger.info({ eventId, eventType }, 'Webhook event already processed');
    res.status(200).json({ received: true, status: 'already_processed' });
    return;
  }

  // Store event for processing
  const storedEvent = await storeWebhookEvent(eventId, eventType, payload as unknown as Record<string, unknown>);
  if (!storedEvent) {
    // Event was already being processed (race condition)
    res.status(200).json({ received: true, status: 'duplicate' });
    return;
  }

  // CRITICAL: Respond immediately (Square requires <2 second response)
  res.status(200).json({ received: true, event_id: eventId });

  // Process event asynchronously (don't await)
  setImmediate(async () => {
    try {
      await processWebhookEvent(payload);
      logger.info({
        eventId,
        eventType,
        processingTime: Date.now() - startTime,
      }, 'Webhook processing complete');
    } catch (err) {
      logger.error({
        error: err,
        eventId,
        eventType,
      }, 'Background webhook processing failed');
      // Error is already logged and event marked as failed in processWebhookEvent
    }
  });
}

/**
 * Health check endpoint for webhook configuration verification.
 */
export function webhookHealthCheck(_req: Request, res: Response): void {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
}

