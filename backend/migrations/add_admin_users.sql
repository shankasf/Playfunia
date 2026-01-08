-- ============================================================
-- Add Admin Users: emelgumustop@hotmail.com and playfunia@playfunia.com
-- These users will need to use "Forgot Password" to set their passwords
-- ============================================================

-- Create customers first (required for linking)
INSERT INTO public.customers (full_name, email, created_at, updated_at)
VALUES
    ('Emel Gumustop', 'emelgumustop@hotmail.com', NOW(), NOW()),
    ('Playfunia Admin', 'playfunia@playfunia.com', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Create admin users
INSERT INTO public.users (email, first_name, last_name, roles, customer_id, created_at, updated_at)
VALUES
    (
        'emelgumustop@hotmail.com',
        'Emel',
        'Gumustop',
        ARRAY['user', 'admin']::text[],
        (SELECT customer_id FROM public.customers WHERE email = 'emelgumustop@hotmail.com' LIMIT 1),
        NOW(),
        NOW()
    ),
    (
        'playfunia@playfunia.com',
        'Playfunia',
        'Admin',
        ARRAY['user', 'admin']::text[],
        (SELECT customer_id FROM public.customers WHERE email = 'playfunia@playfunia.com' LIMIT 1),
        NOW(),
        NOW()
    )
ON CONFLICT (email) DO UPDATE SET
    roles = ARRAY['user', 'admin']::text[],
    updated_at = NOW();

-- Verify
SELECT user_id, email, first_name, last_name, roles FROM public.users
WHERE email IN ('emelgumustop@hotmail.com', 'playfunia@playfunia.com');
