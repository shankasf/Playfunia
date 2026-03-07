import { z } from 'zod';

const nameRegex = /^[A-Za-zÀ-ÿ\s'-]+$/;

export const registerSchema = z.object({
  firstName: z.string().min(1).max(50).regex(nameRegex, 'Name must contain only letters, spaces, hyphens, or apostrophes'),
  lastName: z.string().min(1).max(50).regex(nameRegex, 'Name must contain only letters, spaces, hyphens, or apostrophes'),
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(128).refine(
    (val) => /[a-z]/.test(val) && /[A-Z]/.test(val) && /\d/.test(val),
    'Password must contain at least one lowercase letter, one uppercase letter, and one number'
  ),
  phone: z.string().transform(val => val.replace(/\D/g, '')).refine(val => val.length === 0 || val.length === 10, 'Phone must be 10 digits').optional(),
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
  otp: z.string().length(6).regex(/^\d{6}$/, 'OTP must be exactly 6 digits'),
  type: z.enum(['email_verification', 'password_reset']).default('email_verification'),
});

export type VerifyOTPInput = z.infer<typeof verifyOTPSchema>;

// Password reset schema
export const resetPasswordSchema = z.object({
  email: z.string().email().toLowerCase(),
  otp: z.string().length(6).regex(/^\d{6}$/, 'OTP must be exactly 6 digits'),
  newPassword: z.string().min(8).max(128).refine(
    (val) => /[a-z]/.test(val) && /[A-Z]/.test(val) && /\d/.test(val),
    'Password must contain at least one lowercase letter, one uppercase letter, and one number'
  ),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

