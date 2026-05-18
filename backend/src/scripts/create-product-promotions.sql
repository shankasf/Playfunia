-- ============================================================
-- Product Promotions table
-- Generic promotional pricing for any product type
-- Auto-rollback: query checks NOW() against starts_at/ends_at
-- ============================================================

CREATE TABLE IF NOT EXISTS product_promotions (
  promotion_id     SERIAL PRIMARY KEY,
  product_type     TEXT NOT NULL,                          -- 'membership', 'ticket', 'party', 'add_on'
  product_id       INT,                                    -- NULL = applies to ALL products of that type
  discount_type    TEXT NOT NULL DEFAULT 'percent',         -- 'percent' or 'fixed_price'
  discount_value   NUMERIC(10,2) NOT NULL,                 -- 50 (for 50%) or 125.00 (fixed price)
  promo_label      TEXT,                                   -- 'Launch Promotion – 50% OFF'
  promo_note       TEXT,                                   -- 'For first members only'
  starts_at        TIMESTAMPTZ NOT NULL,
  ends_at          TIMESTAMPTZ NOT NULL,
  max_redemptions  INT,                                    -- NULL = unlimited
  redemptions      INT NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT valid_discount_type CHECK (discount_type IN ('percent', 'fixed_price')),
  CONSTRAINT valid_discount_value CHECK (discount_value > 0),
  CONSTRAINT valid_date_range CHECK (ends_at > starts_at)
);

-- Fast lookup index
CREATE INDEX IF NOT EXISTS idx_product_promotions_active_lookup
  ON product_promotions (product_type, is_active, starts_at, ends_at)
  WHERE is_active = true;

-- Optional: index for product-specific lookups
CREATE INDEX IF NOT EXISTS idx_product_promotions_product
  ON product_promotions (product_type, product_id)
  WHERE is_active = true;

-- ============================================================
-- Seed: Launch Promotion from promo images
-- 50% OFF all membership plans, limited families
-- Adjust starts_at / ends_at / max_redemptions as needed
-- ============================================================

INSERT INTO product_promotions (
  product_type, product_id, discount_type, discount_value,
  promo_label, promo_note, starts_at, ends_at, max_redemptions
) VALUES (
  'membership',
  NULL,                                        -- applies to ALL membership plans
  'percent',
  50,                                          -- 50% off
  'Launch Promotion – 50% OFF',
  'For first members only',
  NOW(),                                       -- starts immediately
  NOW() + INTERVAL '30 days',                  -- 30-day promo window
  100                                          -- limited to 100 families
);

-- Atomic increment function for redemptions (similar to promotions table)
CREATE OR REPLACE FUNCTION increment_product_promotion_redemptions(p_promotion_id INT)
RETURNS VOID AS $$
BEGIN
  UPDATE product_promotions
  SET redemptions = redemptions + 1,
      updated_at = now()
  WHERE promotion_id = p_promotion_id
    AND is_active = true
    AND (max_redemptions IS NULL OR redemptions < max_redemptions);
END;
$$ LANGUAGE plpgsql;

-- Enable RLS
ALTER TABLE product_promotions ENABLE ROW LEVEL SECURITY;

-- Public read access (everyone can see active promos)
CREATE POLICY "Public can read active promotions"
  ON product_promotions FOR SELECT
  USING (is_active = true);

-- Service role full access
CREATE POLICY "Service role full access"
  ON product_promotions FOR ALL
  USING (true)
  WITH CHECK (true);
