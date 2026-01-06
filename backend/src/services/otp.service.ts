import { supabase } from '../config/supabase';
import { generateOTP, sendVerificationOTP, sendPasswordResetOTP } from './email.service';
import { AppError } from '../utils/app-error';

const OTP_EXPIRY_MINUTES = 10;

interface OTPRecord {
  id: number;
  email: string;
  otp_code: string;
  otp_type: 'email_verification' | 'password_reset';
  expires_at: string;
  verified_at: string | null;
  created_at: string;
}

// Ensure OTP table exists
async function ensureOTPTable(): Promise<void> {
  // Create table if it doesn't exist using raw SQL
  const { error } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS email_otps (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        otp_code VARCHAR(6) NOT NULL,
        otp_type VARCHAR(50) NOT NULL DEFAULT 'email_verification',
        expires_at TIMESTAMPTZ NOT NULL,
        verified_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_email_otps_email ON email_otps(email);
      CREATE INDEX IF NOT EXISTS idx_email_otps_expires ON email_otps(expires_at);
    `
  });

  // If rpc doesn't exist, try direct insert (table might already exist)
  if (error && !error.message.includes('already exists')) {
    console.warn('Could not create OTP table via RPC, assuming it exists:', error.message);
  }
}

// Initialize OTP table on module load
let tableInitialized = false;

async function initTable() {
  if (!tableInitialized) {
    await ensureOTPTable();
    tableInitialized = true;
  }
}

// Store OTP in database
async function storeOTP(email: string, otp: string, type: 'email_verification' | 'password_reset'): Promise<void> {
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

  // Delete any existing OTPs for this email and type
  await supabase
    .from('email_otps')
    .delete()
    .eq('email', email.toLowerCase())
    .eq('otp_type', type);

  // Insert new OTP
  const { error } = await supabase
    .from('email_otps')
    .insert({
      email: email.toLowerCase(),
      otp_code: otp,
      otp_type: type,
      expires_at: expiresAt,
    });

  if (error) {
    console.error('Failed to store OTP:', error);
    throw new AppError('Failed to generate verification code', 500);
  }
}

// Verify OTP from database
async function verifyStoredOTP(email: string, otp: string, type: 'email_verification' | 'password_reset'): Promise<boolean> {
  const { data, error } = await supabase
    .from('email_otps')
    .select('*')
    .eq('email', email.toLowerCase())
    .eq('otp_code', otp)
    .eq('otp_type', type)
    .is('verified_at', null)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error || !data) {
    return false;
  }

  // Mark as verified
  await supabase
    .from('email_otps')
    .update({ verified_at: new Date().toISOString() })
    .eq('id', data.id);

  return true;
}

// Send email verification OTP
export async function sendEmailVerificationOTP(email: string, firstName?: string): Promise<{ success: boolean; message: string }> {
  const otp = generateOTP();

  // Store OTP first
  await storeOTP(email, otp, 'email_verification');

  // Send email
  const sent = await sendVerificationOTP(email, otp, firstName);

  if (!sent) {
    return {
      success: false,
      message: 'Failed to send verification email. Please try again.',
    };
  }

  return {
    success: true,
    message: 'Verification code sent to your email.',
  };
}

// Verify email with OTP
export async function verifyEmailOTP(email: string, otp: string): Promise<{ success: boolean; message: string }> {
  const isValid = await verifyStoredOTP(email, otp, 'email_verification');

  if (!isValid) {
    return {
      success: false,
      message: 'Invalid or expired verification code.',
    };
  }

  return {
    success: true,
    message: 'Email verified successfully.',
  };
}

// Send password reset OTP
export async function sendPasswordResetOTPEmail(email: string, firstName?: string): Promise<{ success: boolean; message: string }> {
  const otp = generateOTP();

  // Store OTP first
  await storeOTP(email, otp, 'password_reset');

  // Send email
  const sent = await sendPasswordResetOTP(email, otp, firstName);

  if (!sent) {
    return {
      success: false,
      message: 'Failed to send reset email. Please try again.',
    };
  }

  return {
    success: true,
    message: 'Password reset code sent to your email.',
  };
}

// Verify password reset OTP
export async function verifyPasswordResetOTP(email: string, otp: string): Promise<{ success: boolean; message: string }> {
  const isValid = await verifyStoredOTP(email, otp, 'password_reset');

  if (!isValid) {
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

// Check if email is verified (has a verified OTP record)
export async function isEmailVerified(email: string): Promise<boolean> {
  const { data } = await supabase
    .from('email_otps')
    .select('id')
    .eq('email', email.toLowerCase())
    .eq('otp_type', 'email_verification')
    .not('verified_at', 'is', null)
    .limit(1);

  return data !== null && data.length > 0;
}

// Clean up expired OTPs (can be called periodically)
export async function cleanupExpiredOTPs(): Promise<void> {
  await supabase
    .from('email_otps')
    .delete()
    .lt('expires_at', new Date().toISOString());
}
