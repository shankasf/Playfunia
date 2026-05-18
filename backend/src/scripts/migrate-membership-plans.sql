-- Migration: Replace Silver/Gold/Platinum/VIP Platinum plans with Mini/Super/Mega Plans
-- Run this against the Supabase database

BEGIN;

-- Step 1: Deactivate old plans (keep records for existing membership references)
UPDATE public.membership_plans
SET is_active = false, updated_at = NOW()
WHERE name IN ('Silver', 'Gold', 'Platinum', 'VIP Platinum')
  AND is_active = true;

-- Step 2: Insert new plans
INSERT INTO public.membership_plans (name, description, monthly_price, benefits, max_children, visits_per_month, discount_percent, guest_passes_per_month, is_active)
VALUES
  (
    'Mini Plan',
    'Includes 1 Kid + 1 Adult',
    250.00,
    ARRAY[
      'Unlimited open play visits',
      '1 Kid + 1 Adult included',
      'Grip socks included',
      'Access to all play areas'
    ],
    1,
    NULL,
    0.00,
    0,
    true
  ),
  (
    'Super Plan',
    'Includes 2 Kids + 2 Adults',
    440.00,
    ARRAY[
      'Unlimited open play visits',
      '2 Kids + 2 Adults included',
      'Grip socks included',
      'Access to all play areas',
      'Priority event access'
    ],
    2,
    NULL,
    0.00,
    0,
    true
  ),
  (
    'Mega Plan',
    'Includes 3 Kids + 3 Adults',
    630.00,
    ARRAY[
      'Unlimited open play visits',
      '3 Kids + 3 Adults included',
      'Grip socks included',
      'Access to all play areas',
      'Priority event access',
      'VIP party discounts'
    ],
    3,
    NULL,
    0.00,
    0,
    true
  );

-- Step 3: Deactivate old promotions for deactivated plans
UPDATE public.product_promotions
SET is_active = false, updated_at = NOW()
WHERE product_type = 'membership'
  AND product_id IN (
    SELECT plan_id FROM public.membership_plans
    WHERE name IN ('Silver', 'Gold', 'Platinum', 'VIP Platinum')
  );

-- Step 4: Create 50% off promotions for the new plans (Limited Promo Pricing)
INSERT INTO public.product_promotions (product_type, product_id, promo_label, promo_note, discount_type, discount_value, starts_at, ends_at, max_redemptions, redemptions, is_active)
SELECT
  'membership',
  plan_id,
  'LIMITED TIME - 50% OFF',
  'Limited promo pricing for early members',
  'percent',
  50,
  NOW(),
  NOW() + INTERVAL '90 days',
  100,
  0,
  true
FROM public.membership_plans
WHERE name IN ('Mini Plan', 'Super Plan', 'Mega Plan')
  AND is_active = true;

COMMIT;
