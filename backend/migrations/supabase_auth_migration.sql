-- ============================================================
-- SUPABASE AUTH MIGRATION
-- Run this AFTER restoring your main schema
-- Adds Supabase Auth support without dropping existing tables
-- ============================================================

-- 1. Add auth_user_id column to users table (links to Supabase auth.users)
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE;

-- 2. Create index for faster lookups by auth_user_id
CREATE INDEX IF NOT EXISTS ix_users_auth_user_id ON public.users(auth_user_id);

-- 3. Make password_hash nullable (Supabase Auth handles passwords now)
ALTER TABLE public.users
ALTER COLUMN password_hash DROP NOT NULL;

-- 4. Create trigger function to auto-link Supabase auth users to public.users
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
    v_customer_id INTEGER;
    v_full_name TEXT;
BEGIN
    -- Check if user already exists by email
    IF EXISTS (SELECT 1 FROM public.users WHERE email = NEW.email) THEN
        -- Link existing user to Supabase auth
        UPDATE public.users
        SET auth_user_id = NEW.id,
            updated_at = NOW()
        WHERE email = NEW.email;
    ELSE
        -- Build full name from metadata
        v_full_name := TRIM(
            COALESCE(NEW.raw_user_meta_data->>'first_name', '') || ' ' ||
            COALESCE(NEW.raw_user_meta_data->>'last_name', '')
        );
        IF v_full_name = '' OR v_full_name = ' ' THEN
            v_full_name := SPLIT_PART(NEW.email, '@', 1);
        END IF;

        -- Create customer record first
        INSERT INTO public.customers (full_name, email, phone, created_at, updated_at)
        VALUES (
            v_full_name,
            NEW.email,
            NEW.raw_user_meta_data->>'phone',
            NOW(),
            NOW()
        )
        RETURNING customer_id INTO v_customer_id;

        -- Create new user linked to Supabase auth and customer
        INSERT INTO public.users (
            email,
            auth_user_id,
            first_name,
            last_name,
            phone,
            customer_id,
            roles,
            created_at,
            updated_at
        )
        VALUES (
            NEW.email,
            NEW.id,
            COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
            COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
            NEW.raw_user_meta_data->>'phone',
            v_customer_id,
            ARRAY['user'],
            NOW(),
            NOW()
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Create trigger on auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- 6. Grant execute permission
GRANT EXECUTE ON FUNCTION public.handle_new_auth_user() TO service_role;

-- ============================================================
-- VERIFICATION
-- ============================================================
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Supabase Auth Migration Complete!';
    RAISE NOTICE 'Added: auth_user_id column to users';
    RAISE NOTICE 'Added: Auto-link trigger for new signups';
    RAISE NOTICE 'password_hash is now nullable';
    RAISE NOTICE '========================================';
END $$;
