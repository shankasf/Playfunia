import { z } from 'zod';

export const registerSchema = z.object({
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(128),
  phone: z.string().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(128),
});

export type LoginInput = z.infer<typeof loginSchema>;

// OTP verification schemas
export const sendOTPSchema = z.object({
  email: z.string().email().toLowerCase(),
  type: z.enum(['email_verification', 'password_reset']).default('email_verification'),
});

export type SendOTPInput = z.infer<typeof sendOTPSchema>;

export const verifyOTPSchema = z.object({
  email: z.string().email().toLowerCase(),
  otp: z.string().length(6),
  type: z.enum(['email_verification', 'password_reset']).default('email_verification'),
});

export type VerifyOTPInput = z.infer<typeof verifyOTPSchema>;

// Password reset schema
export const resetPasswordSchema = z.object({
  email: z.string().email().toLowerCase(),
  otp: z.string().length(6),
  newPassword: z.string().min(8).max(128),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

