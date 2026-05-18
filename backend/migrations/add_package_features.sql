-- Add features and additional_terms columns to party_packages table
-- Run this in Supabase Dashboard → SQL Editor

ALTER TABLE party_packages ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '[]';
ALTER TABLE party_packages ADD COLUMN IF NOT EXISTS additional_terms JSONB DEFAULT '[]';
ALTER TABLE party_packages ADD COLUMN IF NOT EXISTS extra_child_price NUMERIC(10,2) DEFAULT 40.00;
ALTER TABLE party_packages ADD COLUMN IF NOT EXISTS extra_adult_price NUMERIC(10,2) DEFAULT 10.00;

-- Update Mini Fun features
UPDATE party_packages SET
  features = '[
    "Enjoy exclusive access to our private party room for 2 hours",
    "Unlimited fun with all-day park access",
    "Bring your own snacks or treats – we make it easy for your party to be exactly how you want",
    "Guests handle decorations, food, and party items – your way, your style"
  ]'::jsonb,
  extra_child_price = 40.00,
  extra_adult_price = 10.00
WHERE name = 'Mini Fun';

-- Update Super Fun features
UPDATE party_packages SET
  features = '[
    "Enjoy exclusive access to our private party room for 2 hours",
    "Unlimited fun with all-day park access",
    "Party supplies included – everything you need for a fun and colorful celebration|Choose from a blue, pink, or white party theme: tableware, napkins, utensils",
    "One slice of cheese pizza and drinks (water/juice) for every child",
    "Snack tray to share – cookies & chips for everyone to enjoy"
  ]'::jsonb,
  extra_child_price = 40.00,
  extra_adult_price = 10.00
WHERE name = 'Super Fun';

-- Update Mega Fun features
UPDATE party_packages SET
  features = '[
    "Enjoy exclusive access to our private party room for 2 hours",
    "Unlimited fun with all-day park access",
    "Custom themed balloon decorations – bring your child''s favorite characters and colors to life",
    "Coordinated theme-matching tableware and extras – plates, cups, and decor that match your theme",
    "Pizza and drinks for every child – one slice of cheese pizza plus water and juice",
    "Snack tray to share – cookies & chips for everyone to enjoy"
  ]'::jsonb,
  extra_child_price = 40.00,
  extra_adult_price = 10.00
WHERE name = 'Mega Fun';

-- Additional terms for Mini Fun (no pizza/drinks included)
UPDATE party_packages SET
  additional_terms = '[
    {"title": "Additional time", "description": "May be purchased during checkout."},
    {"title": "Additional children and guests", "description": "May be added during checkout for a fee."},
    {"title": "Cleaning fee", "description": "There is a $50 cleaning fee added to all party orders."},
    {"title": "Party room access", "description": "Guests have exclusive access to the party room, the play area remains open to the public."}
  ]'::jsonb
WHERE name = 'Mini Fun';

-- Additional terms for Super Fun and Mega Fun (includes pizza/drinks term)
UPDATE party_packages SET
  additional_terms = '[
    {"title": "Pizza and drinks", "description": "Only accounted for children. Additional pizza may be purchased separately for adults."},
    {"title": "Additional time", "description": "May be purchased during checkout."},
    {"title": "Additional children and guests", "description": "May be added during checkout for a fee."},
    {"title": "Cleaning fee", "description": "There is a $50 cleaning fee added to all party orders."},
    {"title": "Party room access", "description": "Guests have exclusive access to the party room, the play area remains open to the public."}
  ]'::jsonb
WHERE name IN ('Super Fun', 'Mega Fun') AND is_active = true;

-- Verify the updates
SELECT name, features, additional_terms, extra_child_price, extra_adult_price FROM party_packages WHERE is_active = true;
