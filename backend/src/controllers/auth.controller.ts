import type { Request, Response } from 'express';
import { ZodError } from 'zod';

import {
  loginSchema,
  registerSchema,
  sendOTPSchema,
  verifyOTPSchema,
  resetPasswordSchema,
} from '../schemas/auth.schema';
import { loginUser, prepareRegistration, createVerifiedUser, resetUserPassword } from '../services/auth.service';
import { UserRepository } from '../repositories';
import {
  sendEmailVerificationOTP,
  sendRegistrationOTP,
  verifyEmailOTP,
  sendPasswordResetOTPEmail,
  verifyPasswordResetOTP,
  checkPasswordResetOTPVerified,
} from '../services/otp.service';
import { AppError } from '../utils/app-error';
import { asyncHandler } from '../utils/async-handler';

export const registerHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = parseWithSchema(registerSchema, req.body);

  // Prepare registration data (validates email doesn't exist, hashes password)
  const registrationData = await prepareRegistration(parsed);

  // Send OTP with pending registration data - account created only after verification
  const result = await sendRegistrationOTP(parsed.email, registrationData);

  if (!result.success) {
    throw new AppError(result.message, 500);
  }

  return res.status(200).json({
    success: true,
    message: 'Verification code sent to your email. Please verify to complete registration.',
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
    // Check if user exists before sending password reset OTP
    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await UserRepository.findByEmail(normalizedEmail);
    if (!existingUser) {
      throw new AppError('No account found with this email address. Please check your email or create a new account.', 404);
    }
    // Pass phone number for SMS notification alongside email
    result = await sendPasswordResetOTPEmail(email, existingUser.first_name, existingUser.phone);
  } else {
    // For email verification, look up user to get their phone (if they exist)
    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await UserRepository.findByEmail(normalizedEmail);
    result = await sendEmailVerificationOTP(email, existingUser?.first_name, existingUser?.phone);
  }

  if (!result.success) {
    throw new AppError(result.message, 400);
  }

  return res.status(200).json(result);
});

// Verify OTP handler
export const verifyOTPHandler = asyncHandler(async (req: Request, res: Response) => {
  const { email, otp, type } = parseWithSchema(verifyOTPSchema, req.body);

  if (type === 'password_reset') {
    const result = await verifyPasswordResetOTP(email, otp);
    if (!result.success) {
      throw new AppError(result.message, 400);
    }
    return res.status(200).json(result);
  }

  // Email verification
  const result = await verifyEmailOTP(email, otp);

  if (!result.success) {
    throw new AppError(result.message, 400);
  }

  // If this was a new registration, create the user now
  if (result.registrationData) {
    const userResult = await createVerifiedUser(result.registrationData);
    return res.status(201).json({
      success: true,
      message: 'Email verified and account created successfully.',
      ...userResult,
    });
  }

  // Just email verification for existing user
  return res.status(200).json(result);
});

// Reset password handler
export const resetPasswordHandler = asyncHandler(async (req: Request, res: Response) => {
  const { email, otp, newPassword } = parseWithSchema(resetPasswordSchema, req.body);

  // Check if OTP was recently verified (two-step flow: verify first, then reset)
  const verifiedResult = await checkPasswordResetOTPVerified(email, otp);

  if (!verifiedResult.valid) {
    // Try to verify OTP now (one-step flow: verify and reset at once)
    const otpResult = await verifyPasswordResetOTP(email, otp);
    if (!otpResult.success) {
      throw new AppError(otpResult.message, 400);
    }
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
