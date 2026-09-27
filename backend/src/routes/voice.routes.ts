/**
 * Voice service routes (server-to-server).
 *
 * Guarded by a shared secret rather than a user session: the Python
 * voice_service sends `X-Voice-Secret: <VOICE_BACKEND_SECRET>`. If the env var
 * is unset the routes are disabled (fail closed) so they can never be hit
 * unauthenticated in production.
 */
import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';

import {
  createVoicePaymentLinkHandler,
  createVoiceCallbackHandler,
} from '../controllers/voice.controller';

export const voiceRouter = Router();

function requireVoiceSecret(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.VOICE_BACKEND_SECRET;
  if (!expected) {
    res.status(503).json({ message: 'Voice integration is not configured.' });
    return;
  }
  const provided = req.header('X-Voice-Secret');
  if (!provided || provided !== expected) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  next();
}

voiceRouter.use(requireVoiceSecret);
voiceRouter.post('/payment-link', createVoicePaymentLinkHandler);
voiceRouter.post('/callback', createVoiceCallbackHandler);
