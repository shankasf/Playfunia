-- Coupon system: extend promotions table with category targeting and minimum-purchase rules.
-- Run this in Supabase Dashboard → SQL Editor.

-- 1. Category targeting: which purchase types this coupon applies to.
--    Allowed values: 'all', 'membership', 'ticket', 'booking'
ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS applies_to TEXT[] DEFAULT ARRAY['all']::TEXT[];

-- 2. Minimum-purchase rule (subtotal must meet this before coupon applies).
ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS min_purchase_usd NUMERIC(10,2);

-- 3. Backfill existing rows so they remain valid.
UPDATE public.promotions
   SET applies_to = ARRAY['all']::TEXT[]
 WHERE applies_to IS NULL OR cardinality(applies_to) = 0;

-- 4. Allow public read of active coupons so unauthenticated cart can validate.
DROP POLICY IF EXISTS "Public read active coupons" ON public.promotions;
CREATE POLICY "Public read active coupons" ON public.promotions
    FOR SELECT TO anon, authenticated USING (is_active = true);

-- 5. Atomic redemption increment to prevent over-redemption races.
CREATE OR REPLACE FUNCTION public.increment_promotion_redemptions(p_promotion_id INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  new_count INTEGER;
BEGIN
  UPDATE public.promotions
     SET redemptions = COALESCE(redemptions, 0) + 1
   WHERE promotion_id = p_promotion_id
     AND (max_redemptions IS NULL OR COALESCE(redemptions, 0) < max_redemptions)
  RETURNING redemptions INTO new_count;
  RETURN new_count;
END;
$$;

-- 6. Sanity check.
SELECT promotion_id, code, applies_to, min_purchase_usd, percent_off, amount_off_usd, is_active
  FROM public.promotions
ORDER BY promotion_id;
