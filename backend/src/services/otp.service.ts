import { supabase } from '../config/supabase';
import { generateOTP, sendVerificationOTP, sendPasswordResetOTP } from './email.service';
import { sendVerificationOtpSms, sendPasswordResetOtpSms } from './sms.service';
import { hashPassword, verifyPassword } from '../utils/password';
import { seal, open } from '../utils/secret-box';
import { AppError } from '../utils/app-error';

const OTP_EXPIRY_MINUTES = 10;

/**
 * email_otps.otp_code holds a bcrypt hash, not the code itself.
 *
 * A six-digit code is only a million possibilities, so a plaintext column is
 * worth an attacker's time the moment they get any read access to the row -
 * and these codes gate both email verification and password reset.
 *
 * Because the codes are hashed, lookups can no longer filter on the code in
 * SQL. storeOTP deletes any prior row for the same (email, otp_type) before
 * inserting, so in practice there is a single candidate; the helper still walks
 * whatever the query returns rather than relying on that invariant.
 */
async function findMatchingOtp<T extends { otp_code: string }>(
  rows: T[],
  otp: string,
): Promise<T | null> {
  for (const row of rows) {
    try {
      if (await verifyPassword(otp, row.otp_code)) return row;
    } catch {
      // A malformed hash (e.g. a plaintext row predating this change) simply
      // does not match.
    }
  }
  return null;
}

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

  // Insert new OTP (hashed - see findMatchingOtp)
  const { error } = await supabase
    .from('email_otps')
    .insert({
      email: normalizedEmail,
      otp_code: await hashPassword(otp),
      otp_type: type,
      expires_at: expiresAt,
      // Sealed, not bare JSON: this payload carries the signup password, which
      // createVerifiedUser() needs in the clear to call auth.admin.createUser.
      registration_data: registrationData ? { sealed: seal(registrationData) } : null,
    });

  if (error) {
    console.error('Failed to store OTP:', error);
    throw new AppError('Failed to generate verification code', 500);
  }
}

// Delete the outstanding OTP for this address (used when email delivery fails).
// The code itself is no longer selectable, and storeOTP has just cleared out any
// other row for the same (email, otp_type), so those two columns identify it.
async function deleteOTP(
  email: string,
  type: 'email_verification' | 'password_reset'
): Promise<void> {
  const normalizedEmail = email.toLowerCase();
  await supabase
    .from('email_otps')
    .delete()
    .eq('email', normalizedEmail)
    .eq('otp_type', type);
}

// Verify OTP and return registration data if present
async function verifyStoredOTP(
  email: string,
  otp: string,
  type: 'email_verification' | 'password_reset'
): Promise<{ valid: boolean; otpId?: number; registrationData?: PendingRegistrationData }> {
  const normalizedEmail = email.toLowerCase();

  // Narrow in SQL on everything except the code, then compare the hash.
  const { data, error } = await supabase
    .from('email_otps')
    .select('id, otp_code, registration_data')
    .eq('email', normalizedEmail)
    .eq('otp_type', type)
    .gt('expires_at', new Date().toISOString())
    .is('verified_at', null);

  if (error || !data?.length) {
    return { valid: false };
  }

  const match = await findMatchingOtp(
    data as Array<{ id: number; otp_code: string; registration_data: unknown }>,
    otp,
  );
  if (!match) {
    return { valid: false };
  }

  // Mark as verified
  await supabase
    .from('email_otps')
    .update({ verified_at: new Date().toISOString() })
    .eq('id', match.id);

  const sealed = (match.registration_data as { sealed?: string } | null)?.sealed;

  return {
    valid: true,
    otpId: match.id,
    registrationData: open<PendingRegistrationData>(sealed) ?? undefined,
  };
}

/**
 * Drop the row once the account it was holding data for exists. Without this the
 * sealed registration payload lingers until something else prunes the table.
 */
export async function consumeRegistrationOTP(otpId: number): Promise<void> {
  await supabase.from('email_otps').delete().eq('id', otpId);
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
    await deleteOTP(email, 'email_verification');
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
    await deleteOTP(email, 'email_verification');
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
): Promise<{ success: boolean; message: string; otpId?: number; registrationData?: PendingRegistrationData }> {
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
    otpId: result.otpId,
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
    await deleteOTP(email, 'password_reset');
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
    .select('id, otp_code')
    .eq('email', normalizedEmail)
    .eq('otp_type', 'password_reset')
    .gt('verified_at', windowStart);

  if (error || !data?.length) {
    return { valid: false };
  }

  const match = await findMatchingOtp(
    data as Array<{ id: number; otp_code: string }>,
    otp,
  );
  if (!match) {
    return { valid: false };
  }

  // Delete the OTP after successful password reset
  await supabase
    .from('email_otps')
    .delete()
    .eq('id', match.id);

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
