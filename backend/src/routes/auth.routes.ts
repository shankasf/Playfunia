import { Router } from 'express';

import {
  loginHandler,
  registerHandler,
  sendOTPHandler,
  verifyOTPHandler,
  resetPasswordHandler,
} from '../controllers/auth.controller';

export const authRouter = Router();

// Registration and login
authRouter.post('/register', registerHandler);
authRouter.post('/login', loginHandler);

// OTP verification
authRouter.post('/send-otp', sendOTPHandler);
authRouter.post('/verify-otp', verifyOTPHandler);

// Password reset
authRouter.post('/reset-password', resetPasswordHandler);
