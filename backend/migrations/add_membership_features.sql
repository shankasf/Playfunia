-- ============================================================
-- MEMBERSHIP SYSTEM ENHANCEMENTS
-- Adds: display_id, referral system, capacity rules,
--        visit logging, grace periods, refund tracking
-- Safe to re-run: uses IF NOT EXISTS / IF NOT column checks
-- ============================================================

-- 1. Add new columns to memberships table
ALTER TABLE public.memberships ADD COLUMN IF NOT EXISTS display_id VARCHAR(10) UNIQUE;
ALTER TABLE public.memberships ADD COLUMN IF NOT EXISTS grace_period_end DATE;
ALTER TABLE public.memberships ADD COLUMN IF NOT EXISTS first_used_at TIMESTAMPTZ;
ALTER TABLE public.memberships ADD COLUMN IF NOT EXISTS referral_name TEXT;
ALTER TABLE public.memberships ADD COLUMN IF NOT EXISTS referral_normalized TEXT;
ALTER TABLE public.memberships ADD COLUMN IF NOT EXISTS referral_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE public.memberships ADD COLUMN IF NOT EXISTS matched_staff_user_id INTEGER;

-- 2. Add max_adults to membership_plans
ALTER TABLE public.membership_plans ADD COLUMN IF NOT EXISTS max_adults INTEGER DEFAULT 1;

-- Set max_adults = max_children for existing plans (capacity rule: same number of adults as children)
UPDATE public.membership_plans SET max_adults = max_children WHERE max_adults = 1 AND max_children > 1;

-- 3. Create membership_visits table for check-in logging
CREATE TABLE IF NOT EXISTS public.membership_visits (
    visit_id SERIAL PRIMARY KEY,
    membership_id INTEGER NOT NULL REFERENCES public.memberships(membership_id) ON DELETE CASCADE,
    checked_in_at TIMESTAMPTZ DEFAULT now(),
    children_count INTEGER DEFAULT 0,
    adults_count INTEGER DEFAULT 0,
    extra_children INTEGER DEFAULT 0,
    extra_adults INTEGER DEFAULT 0,
    extra_charge NUMERIC(10,2) DEFAULT 0,
    checked_in_by INTEGER,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_membership_visits_membership ON public.membership_visits(membership_id);
CREATE INDEX IF NOT EXISTS idx_membership_visits_date ON public.membership_visits(checked_in_at DESC);

-- RLS for membership_visits
ALTER TABLE public.membership_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on membership_visits" ON public.membership_visits;
CREATE POLICY "Service role full access on membership_visits" ON public.membership_visits
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated read on membership_visits" ON public.membership_visits;
CREATE POLICY "Authenticated read on membership_visits" ON public.membership_visits
    FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated insert on membership_visits" ON public.membership_visits;
CREATE POLICY "Authenticated insert on membership_visits" ON public.membership_visits
    FOR INSERT TO authenticated WITH CHECK (true);

-- Grants
GRANT ALL PRIVILEGES ON public.membership_visits TO service_role;
GRANT SELECT, INSERT ON public.membership_visits TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.membership_visits_visit_id_seq TO service_role, authenticated;

-- 4. Function to generate PF-XXXXXX display IDs
CREATE OR REPLACE FUNCTION public.generate_membership_display_id()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    result TEXT := 'PF-';
    i INTEGER;
BEGIN
    FOR i IN 1..6 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    RETURN result;
END;
$$;

-- 5. Trigger to auto-generate display_id on insert
CREATE OR REPLACE FUNCTION public.set_membership_display_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.display_id IS NULL THEN
        LOOP
            NEW.display_id := public.generate_membership_display_id();
            EXIT WHEN NOT EXISTS (
                SELECT 1 FROM public.memberships
                WHERE display_id = NEW.display_id
                AND membership_id != COALESCE(NEW.membership_id, 0)
            );
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_membership_display_id ON public.memberships;
CREATE TRIGGER trg_membership_display_id
    BEFORE INSERT ON public.memberships
    FOR EACH ROW
    EXECUTE FUNCTION public.set_membership_display_id();

-- 6. Backfill display_id for existing memberships that don't have one
DO $$
DECLARE
    rec RECORD;
    new_id TEXT;
BEGIN
    FOR rec IN SELECT membership_id FROM public.memberships WHERE display_id IS NULL
    LOOP
        LOOP
            new_id := public.generate_membership_display_id();
            EXIT WHEN NOT EXISTS (SELECT 1 FROM public.memberships WHERE display_id = new_id);
        END LOOP;
        UPDATE public.memberships SET display_id = new_id WHERE membership_id = rec.membership_id;
    END LOOP;
END;
$$;

-- 7. Index for referral lookups
CREATE INDEX IF NOT EXISTS idx_memberships_referral_status ON public.memberships(referral_status) WHERE referral_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_memberships_display_id ON public.memberships(display_id) WHERE display_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_memberships_end_date ON public.memberships(end_date) WHERE status = 'active';

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION public.generate_membership_display_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_membership_display_id() TO service_role;
