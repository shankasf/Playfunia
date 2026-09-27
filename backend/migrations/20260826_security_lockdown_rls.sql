-- 20260826_security_lockdown_rls.sql
--
-- Closes the Supabase security-advisor findings (rls_disabled_in_public,
-- sensitive_columns_exposed) plus several holes found while auditing.
--
-- Access model this enforces:
--   * The React frontend uses supabase-js for AUTH ONLY (see
--     frontend/src/lib/supabase.ts - the only importers are AuthContext.tsx and
--     AuthCallbackPage.tsx). It never calls .from() / .rpc(). All data reaches
--     the browser through the Express backend.
--   * backend/src/config/supabase.ts uses SUPABASE_SERVICE_ROLE_KEY, which
--     bypasses RLS. SUPABASE_ANON_KEY is declared in env.ts but never used.
--   * chatbot_service connects as chatbot_readonly / chatbot_logger, both of
--     which have the BYPASSRLS role attribute.
-- => anon and authenticated need no table access beyond the public catalog.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. RLS was OFF on 13 tables while anon held full DML on each of them.
--    (webhook_events alone held ~421k rows; refunds, checkout_sessions and
--    notification_queue hold payment and contact data.)
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'chatbot_query_logs','checkout_sessions','client_error_logs','event_photos',
    'kb_chunks','kb_documents','marketing_campaigns','marketing_recipients',
    'notification_queue','promo_offers','refunds','slot_reservations',
    'webhook_events','email_otps'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
                   'Service role full access', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      'Service role full access', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Policies written without a TO clause default to role "public", which
--    includes anon. These three were named "service"/"service role" but in
--    practice granted the whole internet full access - job_applications holds
--    applicant names, emails and phone numbers.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "job_applications_service_all" ON public.job_applications;
CREATE POLICY "job_applications_service_all" ON public.job_applications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "job_listings_service_all" ON public.job_listings;
CREATE POLICY "job_listings_service_all" ON public.job_listings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "job_listings_public_read" ON public.job_listings;
CREATE POLICY "job_listings_public_read" ON public.job_listings
  FOR SELECT TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS "Service role full access" ON public.product_promotions;
CREATE POLICY "Service role full access" ON public.product_promotions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public can read active promotions" ON public.product_promotions;
CREATE POLICY "Public can read active promotions" ON public.product_promotions
  FOR SELECT TO anon, authenticated USING (is_active = true);

-- ---------------------------------------------------------------------------
-- 3. Blanket USING (true) policies for "authenticated": anybody who completed
--    a normal signup could read - and on the ALL policies also modify and
--    delete - every customer, child, order, payment and waiver record.
--    public.users additionally exposes a password_hash column, which is what
--    tripped the sensitive_columns_exposed advisor.
--    "Anon read on receipts" made every receipt world-readable.
--    No frontend code path depends on any of these; the backend uses the
--    service role.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated access on app_payments"        ON public.app_payments;
DROP POLICY IF EXISTS "Authenticated read on booking_reminders"     ON public.booking_reminders;
DROP POLICY IF EXISTS "Authenticated access on children"           ON public.children;
DROP POLICY IF EXISTS "Authenticated read on customers"            ON public.customers;
DROP POLICY IF EXISTS "Authenticated read on membership_reminders" ON public.membership_reminders;
DROP POLICY IF EXISTS "Authenticated insert on membership_visits"  ON public.membership_visits;
DROP POLICY IF EXISTS "Authenticated read on membership_visits"    ON public.membership_visits;
DROP POLICY IF EXISTS "Authenticated access on memberships"        ON public.memberships;
DROP POLICY IF EXISTS "Authenticated access on order_items"        ON public.order_items;
DROP POLICY IF EXISTS "Authenticated access on orders"             ON public.orders;
DROP POLICY IF EXISTS "Authenticated access on party_bookings"     ON public.party_bookings;
DROP POLICY IF EXISTS "Admin read on payment_logs"                 ON public.payment_logs;
DROP POLICY IF EXISTS "Authenticated access on payments"           ON public.payments;
DROP POLICY IF EXISTS "Anon read on receipts"                      ON public.receipts;
DROP POLICY IF EXISTS "Authenticated read on receipts"             ON public.receipts;
DROP POLICY IF EXISTS "Authenticated access on ticket_purchases"   ON public.ticket_purchases;
DROP POLICY IF EXISTS "Authenticated access on waiver_submissions" ON public.waiver_submissions;
DROP POLICY IF EXISTS "Anon insert on waiver_submissions"          ON public.waiver_submissions;
DROP POLICY IF EXISTS "Authenticated access on waiver_user_children" ON public.waiver_user_children;
DROP POLICY IF EXISTS "Anon insert on waiver_user_children"        ON public.waiver_user_children;
DROP POLICY IF EXISTS "Authenticated access on waiver_users"       ON public.waiver_users;
DROP POLICY IF EXISTS "Anon insert on waiver_users"                ON public.waiver_users;
DROP POLICY IF EXISTS "Authenticated access on waiver_visits"      ON public.waiver_visits;

-- Redundant with "Public read active coupons", which already covers
-- authenticated with the same predicate.
DROP POLICY IF EXISTS "Authenticated read on promotions"           ON public.promotions;

-- public.users: keep a genuine own-row policy instead of USING (true), and
-- never expose the password_hash column to it.
DROP POLICY IF EXISTS "Users can read own data" ON public.users;
CREATE POLICY "Users can read own data" ON public.users
  FOR SELECT TO authenticated USING (auth_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. Table privileges. RLS only filters rows on statements the grant system
--    already allowed, and TRUNCATE is not subject to RLS at all - anon held
--    TRUNCATE on email_otps. Revoke everything, then hand back SELECT on the
--    tables that legitimately have a "Public read" policy.
-- ---------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

GRANT SELECT ON
  public.announcements, public.events, public.faqs, public.job_listings,
  public.locations, public.membership_plans, public.party_add_ons,
  public.party_packages, public.pricing_config, public.product_promotions,
  public.promotions, public.resources, public.store_hours,
  public.testimonials, public.ticket_types
TO anon, authenticated;

-- Column-level grant: an authenticated user may read their own row, but
-- password_hash is never selectable through PostgREST at all.
GRANT SELECT (user_id, email, first_name, last_name, phone, roles, customer_id,
              address_line1, address_line2, address_city, address_state,
              address_postal_code, created_at, updated_at, auth_user_id)
ON public.users TO authenticated;

-- New tables must not inherit blanket anon DML from the default privileges.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. SECURITY DEFINER functions with a mutable search_path can be hijacked by
--    a caller-controlled schema. Pin it on every non-extension function in
--    public (pgvector's own functions are owned by the extension and skipped).
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
      AND (p.proconfig IS NULL
           OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c
                          WHERE c LIKE 'search_path=%'))
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions, pg_temp', r.sig);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Views run with their owner's rights unless told otherwise, so a view over
--    an RLS-protected table launders the protection away.
--    (chatbot_readonly holds SELECT on kb_chunks itself and has BYPASSRLS, so
--    the chatbot keeps working.)
-- ---------------------------------------------------------------------------
ALTER VIEW public.kb_chunks_view SET (security_invoker = on);

-- ---------------------------------------------------------------------------
-- 7. pgvector was installed into public, where anon and authenticated hold
--    USAGE - move it to the extensions schema Supabase reserves for this.
--    chatbot_service/semantic.py casts with an unqualified `::vector`, and the
--    chatbot roles had neither `extensions` on their search_path nor USAGE on
--    the schema, so both have to be granted before the move or semantic search
--    breaks with `type "vector" does not exist`.
-- ---------------------------------------------------------------------------
ALTER ROLE chatbot_readonly SET search_path = "$user", public, extensions;
ALTER ROLE chatbot_logger   SET search_path = "$user", public, extensions;
GRANT USAGE ON SCHEMA extensions TO chatbot_readonly, chatbot_logger;
ALTER EXTENSION vector SET SCHEMA extensions;

COMMIT;

-- After applying: `docker compose restart chatbot` so pooled psycopg2
-- connections pick up the new role search_path.
