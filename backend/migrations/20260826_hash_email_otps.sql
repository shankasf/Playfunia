-- 20260826_hash_email_otps.sql
--
-- email_otps.otp_code held the six-digit code in plaintext. A million-value
-- search space is worth an attacker's time the instant they get any read on the
-- row, and these codes gate email verification and password reset.
--
-- backend/src/services/otp.service.ts now writes a bcrypt hash and compares in
-- Node (see findMatchingOtp there). This migration brings the stored rows and
-- the database-side helpers in line.
--
-- Safe to run against live traffic: at the time of writing the table held 43
-- rows and zero unexpired, unverified ones (newest created_at was 2026-06-16),
-- so no in-flight code is invalidated. Anyone mid-flow would simply request a
-- new code.

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. otp_code was varchar(6), sized for the code itself. A bcrypt hash is 60
--    characters.
-- ---------------------------------------------------------------------------
ALTER TABLE public.email_otps
  ALTER COLUMN otp_code TYPE text;

-- ---------------------------------------------------------------------------
-- 1. Hash the codes that are already stored.
--
--    pgcrypto's gen_salt('bf') emits $2a$, which bcryptjs verifies happily.
--    (The reverse is not true - pgcrypto cannot verify bcryptjs's $2b$ - which
--    is why the application, not the database, owns hashing from here on. See
--    step 2.)
--    Rows already holding a bcrypt hash are skipped so this stays re-runnable.
-- ---------------------------------------------------------------------------
UPDATE public.email_otps
SET otp_code = extensions.crypt(otp_code, extensions.gen_salt('bf'))
WHERE otp_code !~ '^\$2[aby]?\$';

-- ---------------------------------------------------------------------------
-- 2. Drop the two SECURITY DEFINER OTP helpers.
--
--    Nothing calls them: the backend uses direct table access through the
--    service role, and the React frontend makes no .rpc() calls at all. Until
--    20260826_function_execute_privileges.sql they were EXECUTE-able by PUBLIC,
--    which made them an unauthenticated account-takeover chain - store a known
--    code for any address, verify it to stamp verified_at, then walk the
--    backend's password-reset endpoint.
--
--    They cannot simply be taught to hash: they would have to verify codes the
--    application wrote, and pgcrypto cannot check bcryptjs's $2b$ hashes. A
--    second implementation that silently fails to match is worse than none, so
--    the plaintext-writing versions are removed rather than patched.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.store_email_otp(text, text, text, timestamptz);
DROP FUNCTION IF EXISTS public.verify_email_otp(text, text, text);

-- ---------------------------------------------------------------------------
-- 3. registration_data parked the pending signup payload as bare JSON, and that
--    payload includes `password` in the clear - createVerifiedUser() needs the
--    plaintext to call supabase.auth.admin.createUser(). 32 of the 43 rows here
--    were holding real users' passwords, the oldest since January 2026.
--
--    Going forward otp.service.ts seals this payload (utils/secret-box.ts,
--    AES-256-GCM keyed off JWT_SECRET) and auth.controller.ts deletes the row
--    as soon as the account is created. Nothing can recover the old plaintext
--    into the sealed format, and every one of these rows is long expired, so
--    strip the payload outright.
-- ---------------------------------------------------------------------------
UPDATE public.email_otps
SET registration_data = NULL
WHERE registration_data IS NOT NULL
  AND NOT (registration_data ? 'sealed');

-- Deliberately no bulk DELETE here. After the two steps above an old row holds
-- only an email, a bcrypt hash of a long-dead code, and timestamps - nothing
-- sensitive and nothing recoverable - so pruning it is a retention decision
-- rather than a security one, and that call is yours. If you do want it:
--   DELETE FROM public.email_otps WHERE expires_at < NOW() - INTERVAL '30 days';

COMMIT;
