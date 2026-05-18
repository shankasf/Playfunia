-- Rename coupon applies_to category 'booking' → 'party_booking' for clarity.
-- Run in Supabase Dashboard → SQL Editor. Safe to re-run.

UPDATE public.promotions
   SET applies_to = array_replace(applies_to, 'booking', 'party_booking')
 WHERE 'booking' = ANY(applies_to);

-- Sanity check.
SELECT promotion_id, code, applies_to
  FROM public.promotions
ORDER BY promotion_id;
