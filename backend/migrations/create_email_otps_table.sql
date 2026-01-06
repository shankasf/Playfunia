-- Create email_otps table for OTP verification
-- Run this migration in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS email_otps (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  otp_code VARCHAR(6) NOT NULL,
  otp_type VARCHAR(50) NOT NULL DEFAULT 'email_verification',
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_email_otps_email ON email_otps(email);
CREATE INDEX IF NOT EXISTS idx_email_otps_expires ON email_otps(expires_at);
CREATE INDEX IF NOT EXISTS idx_email_otps_type ON email_otps(otp_type);

-- Add RLS (Row Level Security) policies
ALTER TABLE email_otps ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role can manage OTPs" ON email_otps
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Clean up expired OTPs (optional - can be scheduled)
-- DELETE FROM email_otps WHERE expires_at < NOW();

COMMENT ON TABLE email_otps IS 'Stores OTP codes for email verification and password reset';
COMMENT ON COLUMN email_otps.otp_type IS 'Type of OTP: email_verification or password_reset';
