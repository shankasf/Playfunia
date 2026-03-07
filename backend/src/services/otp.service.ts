import { supabase } from '../config/supabase';
import { generateOTP, sendVerificationOTP, sendPasswordResetOTP } from './email.service';
import { sendVerificationOtpSms, sendPasswordResetOtpSms } from './sms.service';
import { AppError } from '../utils/app-error';

const OTP_EXPIRY_MINUTES = 10;

// Registration data stored with OTP for pending registrations
export interface PendingRegistrationData {
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  password: string; // Required for Supabase Auth user creation after OTP verification
  phone?: string;
}

// Store OTP with optional registration data
async function storeOTP(
  email: string,
  otp: string,
  type: 'email_verification' | 'password_reset',
  registrationData?: PendingRegistrationData
): Promise<void> {
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();
  const normalizedEmail = email.toLowerCase();

  // Delete any existing OTPs for this email and type
  await supabase
    .from('email_otps')
    .delete()
    .eq('email', normalizedEmail)
    .eq('otp_type', type);

  // Insert new OTP
  const { error } = await supabase
    .from('email_otps')
    .insert({
      email: normalizedEmail,
      otp_code: otp,
      otp_type: type,
      expires_at: expiresAt,
      registration_data: registrationData || null,
    });

  if (error) {
    console.error('Failed to store OTP:', error);
    throw new AppError('Failed to generate verification code', 500);
  }
}

// Delete a specific OTP (used when email delivery fails)
async function deleteOTP(
  email: string,
  otp: string,
  type: 'email_verification' | 'password_reset'
): Promise<void> {
  const normalizedEmail = email.toLowerCase();
  await supabase
    .from('email_otps')
    .delete()
    .eq('email', normalizedEmail)
    .eq('otp_code', otp)
    .eq('otp_type', type);
}

// Verify OTP and return registration data if present
async function verifyStoredOTP(
  email: string,
  otp: string,
  type: 'email_verification' | 'password_reset'
): Promise<{ valid: boolean; registrationData?: PendingRegistrationData }> {
  const normalizedEmail = email.toLowerCase();

  // Find valid OTP
  const { data, error } = await supabase
    .from('email_otps')
    .select('id, registration_data')
    .eq('email', normalizedEmail)
    .eq('otp_code', otp)
    .eq('otp_type', type)
    .gt('expires_at', new Date().toISOString())
    .is('verified_at', null)
    .single();

  if (error || !data) {
    return { valid: false };
  }

  // Mark as verified
  await supabase
    .from('email_otps')
    .update({ verified_at: new Date().toISOString() })
    .eq('id', data.id);

  return {
    valid: true,
    registrationData: data.registration_data as PendingRegistrationData | undefined,
  };
}

// Send email verification OTP (for existing users re-verifying)
export async function sendEmailVerificationOTP(email: string, firstName?: string, phone?: string): Promise<{ success: boolean; message: string }> {
  const otp = generateOTP();

  // Store OTP first (no registration data for re-verification)
  await storeOTP(email, otp, 'email_verification');

  // Send email
  const emailSent = await sendVerificationOTP(email, otp, firstName);

  if (!emailSent) {
    // Delete the stored OTP since user will never receive it
    await deleteOTP(email, otp, 'email_verification');
    return {
      success: false,
      message: 'Failed to send verification email. Please try again.',
    };
  }

  // Send SMS if phone number is provided
  if (phone) {
    try {
      await sendVerificationOtpSms(phone, otp, firstName);
    } catch (smsError) {
      console.error('Failed to send verification OTP SMS:', smsError);
      // Don't fail the operation if SMS fails - email was sent
    }
  }

  return {
    success: true,
    message: phone ? 'Verification code sent to your email and phone.' : 'Verification code sent to your email.',
  };
}

// Send registration OTP with pending registration data
export async function sendRegistrationOTP(
  email: string,
  registrationData: PendingRegistrationData
): Promise<{ success: boolean; message: string }> {
  const otp = generateOTP();

  // Store OTP with registration data
  await storeOTP(email, otp, 'email_verification', registrationData);

  // Send email
  const emailSent = await sendVerificationOTP(email, otp, registrationData.firstName);

  if (!emailSent) {
    // Delete the stored OTP since user will never receive it
    await deleteOTP(email, otp, 'email_verification');
    return {
      success: false,
      message: 'Failed to send verification email. Please try again.',
    };
  }

  // Send SMS if phone number is provided
  if (registrationData.phone) {
    try {
      await sendVerificationOtpSms(registrationData.phone, otp, registrationData.firstName);
    } catch (smsError) {
      console.error('Failed to send registration OTP SMS:', smsError);
      // Don't fail the operation if SMS fails - email was sent
    }
  }

  return {
    success: true,
    message: registrationData.phone ? 'Verification code sent to your email and phone.' : 'Verification code sent to your email.',
  };
}

// Verify email with OTP - returns registration data if this was a new registration
export async function verifyEmailOTP(
  email: string,
  otp: string
): Promise<{ success: boolean; message: string; registrationData?: PendingRegistrationData }> {
  const result = await verifyStoredOTP(email, otp, 'email_verification');

  if (!result.valid) {
    return {
      success: false,
      message: 'Invalid or expired verification code.',
    };
  }

  return {
    success: true,
    message: 'Email verified successfully.',
    registrationData: result.registrationData,
  };
}

// Send password reset OTP
export async function sendPasswordResetOTPEmail(email: string, firstName?: string, phone?: string): Promise<{ success: boolean; message: string }> {
  const otp = generateOTP();

  // Store OTP first
  await storeOTP(email, otp, 'password_reset');

  // Send email
  const emailSent = await sendPasswordResetOTP(email, otp, firstName);

  if (!emailSent) {
    // Delete the stored OTP since user will never receive it
    await deleteOTP(email, otp, 'password_reset');
    return {
      success: false,
      message: 'Failed to send reset email. Please try again.',
    };
  }

  // Send SMS if phone number is provided
  if (phone) {
    try {
      await sendPasswordResetOtpSms(phone, otp, firstName);
    } catch (smsError) {
      console.error('Failed to send password reset OTP SMS:', smsError);
      // Don't fail the operation if SMS fails - email was sent
    }
  }

  return {
    success: true,
    message: phone ? 'Password reset code sent to your email and phone.' : 'Password reset code sent to your email.',
  };
}

// Verify password reset OTP
export async function verifyPasswordResetOTP(email: string, otp: string): Promise<{ success: boolean; message: string }> {
  const result = await verifyStoredOTP(email, otp, 'password_reset');

  if (!result.valid) {
    return {
      success: false,
      message: 'Invalid or expired reset code.',
    };
  }

  return {
    success: true,
    message: 'Code verified. You can now reset your password.',
  };
}

// Check if password reset OTP was recently verified (for two-step password reset flow)
// This allows: 1) verify OTP, 2) submit new password with same OTP
const PASSWORD_RESET_WINDOW_MINUTES = 15;

export async function checkPasswordResetOTPVerified(email: string, otp: string): Promise<{ valid: boolean }> {
  const normalizedEmail = email.toLowerCase();
  const windowStart = new Date(Date.now() - PASSWORD_RESET_WINDOW_MINUTES * 60 * 1000).toISOString();

  // Find OTP that was verified within the time window
  const { data, error } = await supabase
    .from('email_otps')
    .select('id')
    .eq('email', normalizedEmail)
    .eq('otp_code', otp)
    .eq('otp_type', 'password_reset')
    .gt('verified_at', windowStart)
    .single();

  if (error || !data) {
    return { valid: false };
  }

  // Delete the OTP after successful password reset
  await supabase
    .from('email_otps')
    .delete()
    .eq('id', data.id);

  return { valid: true };
}

// Check if email is verified using RPC
export async function isEmailVerified(email: string): Promise<boolean> {
  // For now, we'll use verify with a dummy OTP that will fail
  // This is a simplified check - you may want to add another RPC for this
  return false;
}

// Clean up expired OTPs - would need another RPC function
export async function cleanupExpiredOTPs(): Promise<void> {
  // Can be implemented with another RPC if needed
  console.log('Cleanup expired OTPs - implement RPC if needed');
}
