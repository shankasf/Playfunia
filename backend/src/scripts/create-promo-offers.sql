-- Create promo_offers table for standalone promotional membership offers
CREATE TABLE IF NOT EXISTS promo_offers (
  offer_id        SERIAL PRIMARY KEY,
  title           TEXT NOT NULL,
  subtitle        TEXT,
  promo_label     TEXT,
  promo_note      TEXT,
  notes           JSONB DEFAULT '[]',
  plans           JSONB NOT NULL DEFAULT '[]',
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ NOT NULL,
  max_redemptions INT,
  redemptions     INT DEFAULT 0,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Seed with launch promotion data from promo images
INSERT INTO promo_offers (title, subtitle, promo_label, promo_note, notes, plans, starts_at, ends_at, max_redemptions)
VALUES (
  'Monthly Unlimited Playground Membership',
  'Unlimited access for 30 days',
  'Launch Promotion – 50% OFF',
  'For first members only',
  '["Daily entry: $20/child", "Unlimited visits for 30 days", "Save up to 80% vs daily visits"]'::jsonb,
  '[
    {"name": "1 Kid + 1 Adult", "normalValue": 600, "regularPrice": 250, "promoPrice": 125, "savingsPercent": 80},
    {"name": "2 Kids + 2 Adults", "normalValue": 1050, "regularPrice": 440, "promoPrice": 220, "savingsPercent": 80},
    {"name": "3 Kids + 3 Adults", "normalValue": 1500, "regularPrice": 630, "promoPrice": 315, "savingsPercent": 80}
  ]'::jsonb,
  now(),
  now() + INTERVAL '90 days',
  50
);
