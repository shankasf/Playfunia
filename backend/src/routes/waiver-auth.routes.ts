import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { lookupHandler, loginHandler } from '../controllers/waiver-auth.controller';

export const waiverAuthRouter = Router();

const waiverAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // 15 attempts per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in a few minutes.' },
});

// POST /waiver-auth/lookup - check if email/phone exists
waiverAuthRouter.post('/lookup', waiverAuthLimiter, lookupHandler);

// POST /waiver-auth/login - login or register waiver user
waiverAuthRouter.post('/login', waiverAuthLimiter, loginHandler);
