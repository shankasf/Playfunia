-- 20260826_function_execute_privileges.sql
--
-- Postgres grants EXECUTE on new functions to PUBLIC by default, and PostgREST
-- exposes every function in `public` as an RPC endpoint. SECURITY DEFINER
-- functions run as their owner, so they bypass RLS *and* table grants - the
-- lockdown in 20260826_security_lockdown_rls.sql did not cover them.
--
-- Verified against the live API with the project's own anon key before writing:
--   POST /rest/v1/rpc/verify_email_otp                 -> 200 false
--   POST /rest/v1/rpc/store_email_otp                  -> 204 (row was written)
--   POST /rest/v1/rpc/get_memberships_needing_reminders -> 200
--
-- store_email_otp + verify_email_otp together are an unauthenticated account
-- takeover: plant a known OTP for any address, verify it to stamp verified_at,
-- then walk the backend's password-reset endpoint, which only checks for a
-- recently-verified row. verify_email_otp on its own also lets a 6-digit code
-- be brute-forced.
--
-- The React frontend makes no .rpc() calls at all (supabase-js is used for auth
-- only), and the backend calls Postgres as service_role, so anon and
-- authenticated need no EXECUTE in this schema.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Take EXECUTE away from PUBLIC/anon/authenticated on every function this
--    project owns, and hand it to service_role. Extension-owned functions
--    (pgvector) are skipped - they are not ours to re-grant.
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. chatbot_service calls kb_search() as chatbot_readonly (semantic.py), so
--    that one grant has to survive the sweep above.
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'kb_search'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO chatbot_readonly', r.sig);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Stop the default from reinstating this on the next function that is
--    created. Trigger functions are unaffected: EXECUTE is checked when a
--    trigger is created, not each time it fires.
-- ---------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

COMMIT;
