-- Which children a membership covers.
--
-- Previously every child on the customer's account was shown as covered by the
-- membership (e.g. 3 kids on a 1-kid Mini Plan). Children picked at purchase
-- (checkout child photo step, or staff in Admin -> Create Membership) are now
-- linked here, capped at the plan's max_children by the backend.
--
-- No backfill: memberships without links show the first max_children children
-- (photo first, then oldest record) until staff pick explicitly.
-- Additive only; safe to apply before the code ships.

CREATE TABLE IF NOT EXISTS public.membership_children (
    membership_id INTEGER NOT NULL REFERENCES public.memberships(membership_id) ON DELETE CASCADE,
    child_id INTEGER NOT NULL REFERENCES public.children(child_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (membership_id, child_id)
);
CREATE INDEX IF NOT EXISTS idx_membership_children_child ON public.membership_children(child_id);
COMMENT ON TABLE public.membership_children IS 'Children covered by a membership (at most the plan max_children)';

ALTER TABLE public.membership_children ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON public.membership_children;
CREATE POLICY "Service role full access" ON public.membership_children
    FOR ALL TO service_role USING (true) WITH CHECK (true);
