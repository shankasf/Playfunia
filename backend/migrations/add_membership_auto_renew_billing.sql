-- Membership auto-renew billing: card on file + idempotent renewal charges.
--
-- When a member buys with auto-renew on, the checkout stores the card in Square
-- (Cards API, linked to a Square customer). The daily renewal job charges that
-- card on the membership's end date and extends it by renewal_months.
-- Additive only; safe to apply before the code ships.

ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS square_customer_id VARCHAR(64);
COMMENT ON COLUMN public.customers.square_customer_id IS 'Square Customers API id; owner of stored cards';

ALTER TABLE public.memberships
    ADD COLUMN IF NOT EXISTS square_card_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS renewal_months INTEGER NOT NULL DEFAULT 1;
COMMENT ON COLUMN public.memberships.square_card_id IS 'Square card on file charged for auto-renew; NULL = no card (e.g. staff-created cash membership)';
COMMENT ON COLUMN public.memberships.renewal_months IS 'Length of each auto-renew term in months (the duration originally purchased)';

-- One row per membership per billing period. The unique key is the guard that
-- stops a period from being charged twice, even if several backend processes
-- run the daily job at once.
CREATE TABLE IF NOT EXISTS public.membership_renewals (
    renewal_id BIGSERIAL PRIMARY KEY,
    membership_id INTEGER NOT NULL REFERENCES public.memberships(membership_id) ON DELETE CASCADE,
    period_end DATE NOT NULL,                   -- end_date being renewed
    status VARCHAR(20) NOT NULL,                -- 'processing' | 'succeeded' | 'failed' | 'skipped'
    attempts INTEGER NOT NULL DEFAULT 1,
    last_attempt_on DATE NOT NULL,              -- ET calendar date of the latest attempt
    amount_usd NUMERIC(10, 2),
    new_end_date DATE,
    order_id INTEGER REFERENCES public.orders(order_id),
    square_payment_id VARCHAR(64),
    square_order_id VARCHAR(64),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (membership_id, period_end)
);
COMMENT ON TABLE public.membership_renewals IS 'Auto-renew charge attempts; unique (membership_id, period_end) prevents double charging';

ALTER TABLE public.membership_renewals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON public.membership_renewals;
CREATE POLICY "Service role full access" ON public.membership_renewals
    FOR ALL TO service_role USING (true) WITH CHECK (true);
