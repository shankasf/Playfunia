import { Router } from 'express';
import type { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';

import {
  loginHandler,
  registerHandler,
  sendOTPHandler,
  verifyOTPHandler,
  resetPasswordHandler,
} from '../controllers/auth.controller';
import { supabaseAuthGuard, supabaseAuthGuardAllowCreate, type SupabaseAuthenticatedRequest } from '../middleware/supabase-auth.middleware';
import { asyncHandler } from '../utils/async-handler';
import { getUserProfile, checkEmailExists } from '../services/auth.service';
import { UserRepository } from '../repositories';

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again later.' },
});

// ============= Supabase Auth Endpoints =============

/**
 * Check if an email is already registered (for Google sign-in flow).
 * Returns whether the user exists in our database.
 */
authRouter.get('/check-email', asyncHandler(async (req: Request, res: Response) => {
  const email = req.query.email as string;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const exists = await checkEmailExists(email);
  return res.status(200).json({ exists });
}));

/**
 * Check if user exists by Supabase auth user ID (for OAuth callback).
 */
authRouter.get('/check-auth-user', asyncHandler(async (req: Request, res: Response) => {
  const authUserId = req.query.authUserId as string;
  if (!authUserId) {
    return res.status(400).json({ error: 'authUserId is required' });
  }

  const user = await UserRepository.findByAuthUserId(authUserId);
  return res.status(200).json({ exists: !!user });
}));

/**
 * Sync profile after Supabase authentication (for SIGN-IN only).
 * Does NOT create new users - requires existing account.
 */
authRouter.post('/sync-profile', supabaseAuthGuard, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as SupabaseAuthenticatedRequest;

  // Get full user profile (getUserProfile expects string)
  const profile = await getUserProfile(authReq.user!.id);

  return res.status(200).json({
    success: true,
    user: profile,
  });
}));

/**
 * Sync profile after Supabase authentication (for SIGN-UP).
 * Creates new user if needed, extracting name from Google metadata.
 */
authRouter.post('/sync-profile-signup', supabaseAuthGuardAllowCreate, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as SupabaseAuthenticatedRequest;

  // Get full user profile (getUserProfile expects string)
  const profile = await getUserProfile(authReq.user!.id);

  return res.status(200).json({
    success: true,
    user: profile,
  });
}));

// ============= Legacy Endpoints (for backward compatibility) =============
// These will continue to work during the transition period
// but new users should use Supabase Auth directly

// Registration and login (legacy - still functional for transition)
authRouter.post('/register', authLimiter, registerHandler);
authRouter.post('/login', authLimiter, loginHandler);

// OTP verification (legacy - Supabase handles this now)
authRouter.post('/send-otp', authLimiter, sendOTPHandler);
authRouter.post('/verify-otp', authLimiter, verifyOTPHandler);

// Password reset (legacy - Supabase handles this now)
authRouter.post('/reset-password', authLimiter, resetPasswordHandler);
