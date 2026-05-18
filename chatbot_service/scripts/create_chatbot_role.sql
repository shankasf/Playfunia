-- Chatbot read-only role for Playfunia.
-- Run with:  psql ... -v chatbot_password='<pw>' -f create_chatbot_role.sql

-- Create or rotate password. (psql substitutes :'chatbot_password' inline,
-- which DO blocks can't see, so handle each branch outside DO.)
SELECT format(
    'CREATE ROLE chatbot_readonly WITH LOGIN PASSWORD %L',
    :'chatbot_password'
) AS create_sql
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chatbot_readonly')
\gexec

SELECT format(
    'ALTER ROLE chatbot_readonly WITH PASSWORD %L',
    :'chatbot_password'
) AS alter_sql
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chatbot_readonly')
\gexec

-- Strip any inherited grants
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM chatbot_readonly;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM chatbot_readonly;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM chatbot_readonly;

GRANT CONNECT ON DATABASE postgres TO chatbot_readonly;
GRANT USAGE   ON SCHEMA public      TO chatbot_readonly;

-- Public-content tables only. Nothing PII, nothing transactional.
GRANT SELECT ON
    public.ticket_types,
    public.membership_plans,
    public.party_packages,
    public.party_add_ons,
    public.pricing_config,
    public.promotions,
    public.product_promotions,
    public.promo_offers,
    public.events,
    public.job_listings,
    public.locations,
    public.store_hours,
    public.faqs,
    public.announcements
TO chatbot_readonly;

ALTER ROLE chatbot_readonly SET default_transaction_read_only = on;
ALTER ROLE chatbot_readonly SET statement_timeout = '5s';

-- BYPASSRLS lets the role read tables that have RLS enabled but where the
-- policies target Supabase-auth roles (anon, authenticated, service_role).
-- This is still safe because the role only has SELECT on public-content
-- tables — RLS bypass on a table you can't see is a no-op.
ALTER ROLE chatbot_readonly BYPASSRLS;

\echo Tables visible to chatbot_readonly:
SELECT table_name
FROM   information_schema.role_table_grants
WHERE  grantee = 'chatbot_readonly'
ORDER  BY table_name;
