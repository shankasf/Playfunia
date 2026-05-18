/**
 * Square Webhook Routes
 *
 * Handles incoming webhooks from Square for:
 * - Payment completion/failure
 * - Refunds
 * - Order updates
 */

import { Router, json, urlencoded } from 'express';
import {
  handleSquareWebhook,
  webhookHealthCheck,
} from '../controllers/webhook.controller';
import { handleTwilioStatusCallback } from '../controllers/twilio-webhook.controller';

export const webhookRouter = Router();

// Health check endpoint (no auth required)
webhookRouter.get('/health', webhookHealthCheck);

// Square webhook endpoint
// Note: Must use raw body for signature verification
// We use json() middleware here with verify to capture raw body
webhookRouter.post(
  '/square',
  json({
    verify: (req, _res, buf) => {
      // Store raw body for signature verification
      (req as typeof req & { rawBody?: string }).rawBody = buf.toString();
    },
  }),
  handleSquareWebhook
);

// Twilio SMS delivery status callback. Twilio POSTs as
// application/x-www-form-urlencoded; signature is validated in the controller
// using twilio.validateRequest() over the parsed params + full URL.
webhookRouter.post(
  '/twilio/status',
  urlencoded({ extended: false }),
  handleTwilioStatusCallback,
);
