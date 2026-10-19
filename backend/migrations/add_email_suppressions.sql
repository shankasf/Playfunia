-- Email deliverability: local mirror of the AWS SES account-level suppression
-- list (hard bounces + complaints) plus "skipped" accounting on campaigns.
--
-- The marketing sender validates every address before sending (syntax, known
-- typo domains, DNS MX lookup, SES suppression list) and records addresses it
-- refused to send to as status='skipped' instead of letting SES bounce them.

CREATE TABLE IF NOT EXISTS public.email_suppressions (
    email VARCHAR(320) PRIMARY KEY,          -- lower-cased address
    reason VARCHAR(20) NOT NULL,             -- 'BOUNCE' | 'COMPLAINT' | 'MANUAL'
    source VARCHAR(20) NOT NULL DEFAULT 'ses', -- 'ses' | 'manual'
    ses_last_update TIMESTAMPTZ,             -- LastUpdateTime reported by SES
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.email_suppressions IS 'Addresses we must not email: mirror of the SES account suppression list (hard bounces/complaints) plus manual entries.';

ALTER TABLE public.marketing_campaigns
    ADD COLUMN IF NOT EXISTS skipped_count INTEGER DEFAULT 0;
COMMENT ON COLUMN public.marketing_campaigns.skipped_count IS 'Recipients not sent to because pre-send email validation rejected the address';
COMMENT ON COLUMN public.marketing_recipients.status IS 'sent | failed | skipped (skipped = address failed pre-send validation; see error)';

-- Service-role only, like the other marketing tables.
ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON public.email_suppressions;
CREATE POLICY "Service role full access" ON public.email_suppressions
    FOR ALL TO service_role USING (true) WITH CHECK (true);
