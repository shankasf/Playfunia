import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

import { lookupHandler, loginHandler } from '../controllers/waiver-auth.controller';

export const waiverAuthRouter = Router();

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const tooManyAttempts = { error: 'Too many attempts. Please try again in a few minutes.' };

// Per network: generous, because every family at the front-desk kiosk shares one IP
// and each visit makes two calls (lookup + login).
const waiverAuthIpLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooManyAttempts,
});

// Per email/phone: limits probing or hammering a single contact. Shared by lookup
// and login, so one family gets about five sign-in flows per window.
const waiverAuthIdentifierLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooManyAttempts,
  keyGenerator: (req) => {
    const body = (req.body ?? {}) as { email?: unknown; phone?: unknown };
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const phone = typeof body.phone === 'string' ? body.phone.replace(/\D/g, '') : '';
    if (email) return `waiver-auth-email:${email}`;
    if (phone) return `waiver-auth-phone:${phone}`;
    return `waiver-auth-ip:${ipKeyGenerator(req.ip ?? '')}`;
  },
});

// POST /waiver-auth/lookup - check if email/phone exists
waiverAuthRouter.post('/lookup', waiverAuthIpLimiter, waiverAuthIdentifierLimiter, lookupHandler);

// POST /waiver-auth/login - login or register waiver user
waiverAuthRouter.post('/login', waiverAuthIpLimiter, waiverAuthIdentifierLimiter, loginHandler);
