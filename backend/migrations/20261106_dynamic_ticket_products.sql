-- 20261106_dynamic_ticket_products.sql
--
-- Makes /buy-ticket fully admin-managed. Every item sold on that page
-- (admission, sibling bundles, extra adults, socks, pizza, extra hour, ...) is a
-- row in ticket_types. Admins add/edit/activate/deactivate/remove rows and
-- categories from Admin -> Products; the page renders whatever is active.
-- Idempotent: safe to run more than once.

BEGIN;

-- 1. Categories (sections on /buy-ticket) ----------------------------------
CREATE TABLE IF NOT EXISTS public.product_categories (
    category_id   SERIAL PRIMARY KEY,
    slug          VARCHAR(60)  NOT NULL UNIQUE,
    name          VARCHAR(100) NOT NULL,
    description   TEXT,
    layout        VARCHAR(20)  NOT NULL DEFAULT 'cards',   -- 'cards' | 'list'
    display_order INTEGER      NOT NULL DEFAULT 0,
    is_active     BOOLEAN      NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on product_categories" ON public.product_categories;
CREATE POLICY "Service role full access on product_categories" ON public.product_categories
    FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT ALL ON public.product_categories TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.product_categories_category_id_seq TO service_role;

INSERT INTO public.product_categories (slug, name, description, layout, display_order) VALUES
    ('admission', 'Admission',       'Day passes for open play',                'cards', 1),
    ('bundles',   'Sibling Bundles', 'Save more when siblings play together',  'list',  2),
    ('add-ons',   'Add-ons & Extras','Grab these now and skip the line',        'cards', 3)
ON CONFLICT (slug) DO NOTHING;

-- 2. New ticket_types columns ----------------------------------------------
ALTER TABLE public.ticket_types
    ADD COLUMN IF NOT EXISTS category_id   INTEGER REFERENCES public.product_categories(category_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS code          VARCHAR(60),
    ADD COLUMN IF NOT EXISTS image_url     TEXT,
    ADD COLUMN IF NOT EXISTS unit_label    VARCHAR(30),
    ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS max_quantity  INTEGER NOT NULL DEFAULT 10,
    ADD COLUMN IF NOT EXISTS is_deleted    BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS ticket_types_code_key ON public.ticket_types (code) WHERE code IS NOT NULL;

-- 3. Backfill existing rows -------------------------------------------------
-- System rows: their price is mirrored into pricing_config by the backend.
UPDATE public.ticket_types SET code = 'single_admission' WHERE ticket_type_id = 9  AND code IS NULL;
UPDATE public.ticket_types SET code = 'grip_socks'       WHERE ticket_type_id = 15 AND code IS NULL;

UPDATE public.ticket_types t SET category_id = c.category_id
  FROM public.product_categories c
 WHERE t.category_id IS NULL
   AND c.slug = CASE WHEN COALESCE(t.child_count, 1) >= 2 THEN 'bundles'
                     WHEN COALESCE(t.child_count, 1) = 1 THEN 'admission'
                     ELSE 'add-ons' END;

UPDATE public.ticket_types SET unit_label = 'child', display_order = 1, max_quantity = 10
 WHERE code = 'single_admission' AND unit_label IS NULL;
UPDATE public.ticket_types SET unit_label = 'pair', display_order = 1, max_quantity = 20,
       description = COALESCE(NULLIF(description, ''), 'Grip socks are required in the play area')
 WHERE code = 'grip_socks' AND unit_label IS NULL;
UPDATE public.ticket_types SET display_order = child_count, max_quantity = 5
 WHERE COALESCE(child_count, 1) >= 2 AND display_order = 0;

-- Extra Adult becomes a sellable row priced from pricing_config.
INSERT INTO public.ticket_types (name, description, base_price_usd, child_count, requires_waiver,
                                 requires_grip_socks, is_active, category_id, code, unit_label,
                                 display_order, max_quantity)
SELECT 'Extra Adults', '1 free adult is included with every child. Add more adults here.',
       COALESCE((SELECT config_value FROM public.pricing_config WHERE config_key = 'extra_adult_admission_price'), 5),
       0, false, false, true,
       (SELECT category_id FROM public.product_categories WHERE slug = 'admission'),
       'extra_adult', 'adult', 2, 20
WHERE NOT EXISTS (SELECT 1 FROM public.ticket_types WHERE code = 'extra_adult');

-- 4. Record which ticket type a purchase was for ---------------------------
ALTER TABLE public.ticket_purchases
    ADD COLUMN IF NOT EXISTS ticket_type_id INTEGER;

COMMIT;
