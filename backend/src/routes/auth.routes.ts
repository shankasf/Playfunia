import { Router } from 'express';
import type { Request, Response } from 'express';

import {
  loginHandler,
  registerHandler,
  sendOTPHandler,
  verifyOTPHandler,
  resetPasswordHandler,
} from '../controllers/auth.controller';
import { supabaseAuthGuard, type SupabaseAuthenticatedRequest } from '../middleware/supabase-auth.middleware';
import { asyncHandler } from '../utils/async-handler';
import { getUserProfile } from '../services/auth.service';

export const authRouter = Router();

// ============= Supabase Auth Endpoints =============

/**
 * Sync profile after Supabase authentication.
 * Called by frontend after successful Supabase login to ensure user record exists.
 * The supabaseAuthGuard will automatically create the user if needed.
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

// ============= Legacy Endpoints (for backward compatibility) =============
// These will continue to work during the transition period
// but new users should use Supabase Auth directly

// Registration and login (legacy - still functional for transition)
authRouter.post('/register', registerHandler);
authRouter.post('/login', loginHandler);

// OTP verification (legacy - Supabase handles this now)
authRouter.post('/send-otp', sendOTPHandler);
authRouter.post('/verify-otp', verifyOTPHandler);

// Password reset (legacy - Supabase handles this now)
authRouter.post('/reset-password', resetPasswordHandler);
