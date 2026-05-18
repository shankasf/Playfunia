-- Coupon redemption audit trail on orders.
-- Records which coupon (if any) was applied to each order.
-- Run in Supabase Dashboard → SQL Editor. Safe to re-run.

-- 1. FK to promotions. ON DELETE SET NULL preserves the order if a coupon
--    is later deleted (we still keep the snapshot in coupon_code).
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS promotion_id INTEGER
    REFERENCES public.promotions(promotion_id) ON DELETE SET NULL;

-- 2. Snapshot of the redeemed code at order time. Survives coupon deletion
--    and renaming so the audit trail stays human-readable.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(40);

-- 3. Index for "show me all orders that used coupon X" queries.
CREATE INDEX IF NOT EXISTS idx_orders_promotion_id
  ON public.orders(promotion_id)
  WHERE promotion_id IS NOT NULL;

-- 4. Sanity check.
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'orders'
   AND column_name IN ('promotion_id', 'coupon_code');
