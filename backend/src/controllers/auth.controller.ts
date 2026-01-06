import type { Request, Response } from 'express';
import { ZodError } from 'zod';

import {
  loginSchema,
  registerSchema,
  sendOTPSchema,
  verifyOTPSchema,
  resetPasswordSchema,
} from '../schemas/auth.schema';
import { loginUser, registerUser, resetUserPassword } from '../services/auth.service';
import {
  sendEmailVerificationOTP,
  verifyEmailOTP,
  sendPasswordResetOTPEmail,
  verifyPasswordResetOTP,
} from '../services/otp.service';
import { AppError } from '../utils/app-error';
import { asyncHandler } from '../utils/async-handler';

export const registerHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = parseWithSchema(registerSchema, req.body);
  const result = await registerUser(parsed);

  // Send verification OTP after registration
  await sendEmailVerificationOTP(parsed.email, parsed.firstName);

  return res.status(201).json({
    ...result,
    message: 'Registration successful. Please verify your email with the code sent to your inbox.',
    emailVerificationRequired: true,
  });
});

export const loginHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = parseWithSchema(loginSchema, req.body);
  const result = await loginUser(parsed);
  return res.status(200).json(result);
});

// Send OTP handler
export const sendOTPHandler = asyncHandler(async (req: Request, res: Response) => {
  const { email, type } = parseWithSchema(sendOTPSchema, req.body);

  let result;
  if (type === 'password_reset') {
    result = await sendPasswordResetOTPEmail(email);
  } else {
    result = await sendEmailVerificationOTP(email);
  }

  if (!result.success) {
    throw new AppError(result.message, 400);
  }

  return res.status(200).json(result);
});

// Verify OTP handler
export const verifyOTPHandler = asyncHandler(async (req: Request, res: Response) => {
  const { email, otp, type } = parseWithSchema(verifyOTPSchema, req.body);

  let result;
  if (type === 'password_reset') {
    result = await verifyPasswordResetOTP(email, otp);
  } else {
    result = await verifyEmailOTP(email, otp);
  }

  if (!result.success) {
    throw new AppError(result.message, 400);
  }

  return res.status(200).json(result);
});

// Reset password handler
export const resetPasswordHandler = asyncHandler(async (req: Request, res: Response) => {
  const { email, otp, newPassword } = parseWithSchema(resetPasswordSchema, req.body);

  // Verify OTP first
  const otpResult = await verifyPasswordResetOTP(email, otp);
  if (!otpResult.success) {
    throw new AppError(otpResult.message, 400);
  }

  // Reset password
  await resetUserPassword(email, newPassword);

  return res.status(200).json({
    success: true,
    message: 'Password reset successfully. You can now log in with your new password.',
  });
});

function parseWithSchema<T>(schema: { parse: (data: unknown) => T }, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const message = error.issues.map(issue => issue.message).join(', ');
      throw new AppError(`Validation failed: ${message}`, 400, { cause: error });
    }
    throw error;
  }
}
