-- ============================================================
-- PLAYFUNIA COMPLETE DATABASE SCHEMA
-- SAFE TO RE-RUN: Uses IF NOT EXISTS, no data loss
-- ============================================================

-- ============================================================
-- 1. SCHEMA PERMISSIONS
-- ============================================================
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated;

-- ============================================================
-- 2. LOCATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.locations (
    location_id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(50),
    postal_code VARCHAR(20),
    phone VARCHAR(50),
    email VARCHAR(200),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on locations" ON public.locations;
CREATE POLICY "Service role full access on locations" ON public.locations
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public read on locations" ON public.locations;
CREATE POLICY "Public read on locations" ON public.locations
    FOR SELECT TO anon, authenticated USING (is_active = true);

-- ============================================================
-- 3. STORE_HOURS
-- Stores operating hours for each day of the week per location
-- ============================================================
CREATE TABLE IF NOT EXISTS public.store_hours (
    id SERIAL PRIMARY KEY,
    location_name VARCHAR(100) NOT NULL,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    -- 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    open_time TIME NOT NULL,
    close_time TIME NOT NULL,
    is_closed BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(location_name, day_of_week)
);

ALTER TABLE public.store_hours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on store_hours" ON public.store_hours;
CREATE POLICY "Service role full access on store_hours" ON public.store_hours
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read on store_hours" ON public.store_hours;
CREATE POLICY "Public read on store_hours" ON public.store_hours
    FOR SELECT TO anon, authenticated USING (is_active = true);

-- ============================================================
-- 4. CUSTOMERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.customers (
    customer_id SERIAL PRIMARY KEY,
    full_name VARCHAR(200) NOT NULL,
    email VARCHAR(200),
    phone VARCHAR(50),
    address TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add columns if they don't exist
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS is_guest BOOLEAN DEFAULT false;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on customers" ON public.customers;
CREATE POLICY "Service role full access on customers" ON public.customers
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated read on customers" ON public.customers;
CREATE POLICY "Authenticated read on customers" ON public.customers
    FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 4. TICKET_TYPES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ticket_types (
    ticket_type_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    base_price_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
    child_count INTEGER DEFAULT 1,
    requires_waiver BOOLEAN DEFAULT true,
    requires_grip_socks BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ticket_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on ticket_types" ON public.ticket_types;
CREATE POLICY "Service role full access on ticket_types" ON public.ticket_types
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public read on ticket_types" ON public.ticket_types;
CREATE POLICY "Public read on ticket_types" ON public.ticket_types
    FOR SELECT TO anon, authenticated USING (is_active = true);

-- ============================================================
-- 5. PARTY_PACKAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.party_packages (
    package_id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    price_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
    base_children INTEGER DEFAULT 10,
    base_room_hours NUMERIC(4,2) DEFAULT 2.0,
    includes_food BOOLEAN DEFAULT false,
    includes_drinks BOOLEAN DEFAULT false,
    includes_decor BOOLEAN DEFAULT false,
    features JSONB DEFAULT '[]',
    additional_terms JSONB DEFAULT '[]',
    extra_child_price NUMERIC(10,2) DEFAULT 40.00,
    extra_adult_price NUMERIC(10,2) DEFAULT 10.00,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Per-package cleaning fee override (NULL means use pricing_config default)
ALTER TABLE public.party_packages ADD COLUMN IF NOT EXISTS cleaning_fee NUMERIC(10,2);

ALTER TABLE public.party_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on party_packages" ON public.party_packages;
CREATE POLICY "Service role full access on party_packages" ON public.party_packages
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public read on party_packages" ON public.party_packages;
CREATE POLICY "Public read on party_packages" ON public.party_packages
    FOR SELECT TO anon, authenticated USING (is_active = true);

-- ============================================================
-- 6. PARTY_ADD_ONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.party_add_ons (
    add_on_id SERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    label VARCHAR(100) NOT NULL,
    description TEXT,
    price NUMERIC(10,2) NOT NULL DEFAULT 0,
    price_type VARCHAR(20) NOT NULL DEFAULT 'flat',
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT party_add_ons_price_type_check CHECK (price_type IN ('flat', 'perChild', 'duration'))
);

ALTER TABLE public.party_add_ons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on party_add_ons" ON public.party_add_ons;
CREATE POLICY "Service role full access on party_add_ons" ON public.party_add_ons
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public read on party_add_ons" ON public.party_add_ons;
CREATE POLICY "Public read on party_add_ons" ON public.party_add_ons
    FOR SELECT TO anon, authenticated USING (is_active = true);

-- ============================================================
-- 7. PRICING_CONFIG
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pricing_config (
    config_id SERIAL PRIMARY KEY,
    config_key VARCHAR(100) NOT NULL UNIQUE,
    config_value NUMERIC(10,2) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.pricing_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on pricing_config" ON public.pricing_config;
CREATE POLICY "Service role full access on pricing_config" ON public.pricing_config
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public read on pricing_config" ON public.pricing_config;
CREATE POLICY "Public read on pricing_config" ON public.pricing_config
    FOR SELECT TO anon, authenticated USING (is_active = true);

-- ============================================================
-- 8. RESOURCES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.resources (
    resource_id SERIAL PRIMARY KEY,
    location_id INTEGER REFERENCES public.locations(location_id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    type VARCHAR(60) DEFAULT 'PartyRoom',
    capacity INTEGER,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on resources" ON public.resources;
CREATE POLICY "Service role full access on resources" ON public.resources
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public read on resources" ON public.resources;
CREATE POLICY "Public read on resources" ON public.resources
    FOR SELECT TO anon, authenticated USING (is_active = true);

-- ============================================================
-- 9. FAQS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.faqs (
    faq_id SERIAL PRIMARY KEY,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    category VARCHAR(100),
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on faqs" ON public.faqs;
CREATE POLICY "Service role full access on faqs" ON public.faqs
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public read on faqs" ON public.faqs;
CREATE POLICY "Public read on faqs" ON public.faqs
    FOR SELECT TO anon, authenticated USING (is_active = true);

-- ============================================================
-- 10. TESTIMONIALS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.testimonials (
    testimonial_id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    quote TEXT NOT NULL,
    rating NUMERIC(3,1) DEFAULT 5,
    is_featured BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on testimonials" ON public.testimonials;
CREATE POLICY "Service role full access on testimonials" ON public.testimonials
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public read on testimonials" ON public.testimonials;
CREATE POLICY "Public read on testimonials" ON public.testimonials
    FOR SELECT TO anon, authenticated USING (true);

-- ============================================================
-- 11. ANNOUNCEMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.announcements (
    announcement_id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    publish_date TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on announcements" ON public.announcements;
CREATE POLICY "Service role full access on announcements" ON public.announcements
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public read on announcements" ON public.announcements;
CREATE POLICY "Public read on announcements" ON public.announcements
    FOR SELECT TO anon, authenticated USING (is_active = true);

-- ============================================================
-- 12. PROMOTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.promotions (
    promotion_id SERIAL PRIMARY KEY,
    code VARCHAR(40) NOT NULL UNIQUE,
    description TEXT,
    percent_off NUMERIC(5,2),
    amount_off_usd NUMERIC(10,2),
    valid_from TIMESTAMPTZ,
    valid_to TIMESTAMPTZ,
    max_redemptions INTEGER,
    redemptions INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on promotions" ON public.promotions;
CREATE POLICY "Service role full access on promotions" ON public.promotions
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated read on promotions" ON public.promotions;
CREATE POLICY "Authenticated read on promotions" ON public.promotions
    FOR SELECT TO authenticated USING (is_active = true);

-- ============================================================
-- 13. USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
    user_id SERIAL PRIMARY KEY,
    email VARCHAR(200) NOT NULL UNIQUE,
    password_hash VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(50),
    roles TEXT[] DEFAULT ARRAY['user']::text[],
    customer_id INTEGER REFERENCES public.customers(customer_id) ON DELETE SET NULL,
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    address_city VARCHAR(100),
    address_state VARCHAR(50),
    address_postal_code VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add columns for Supabase Auth integration
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE;

-- Make password_hash nullable (Supabase Auth handles passwords)
ALTER TABLE public.users ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on users" ON public.users;
CREATE POLICY "Service role full access on users" ON public.users
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Users can read own data" ON public.users;
CREATE POLICY "Users can read own data" ON public.users
    FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 14. CHILDREN
-- ============================================================
CREATE TABLE IF NOT EXISTS public.children (
    child_id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES public.customers(customer_id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100),
    birth_date DATE,
    gender VARCHAR(20),
    allergies TEXT,
    notes TEXT,
    membership_tier VARCHAR(50),
    photo_url TEXT,
    photo_storage_path TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.children ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE public.children ADD COLUMN IF NOT EXISTS photo_storage_path TEXT;

ALTER TABLE public.children ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on children" ON public.children;
CREATE POLICY "Service role full access on children" ON public.children
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated access on children" ON public.children;
CREATE POLICY "Authenticated access on children" ON public.children
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 15. EVENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.events (
    event_id SERIAL PRIMARY KEY,
    location_id INTEGER REFERENCES public.locations(location_id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    capacity INTEGER,
    tickets_remaining INTEGER,
    price NUMERIC(10,2) DEFAULT 0,
    tags TEXT[] DEFAULT '{}',
    image_url TEXT,
    video_url TEXT,
    media_type VARCHAR(20) DEFAULT 'image',
    is_published BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT events_media_type_check CHECK (media_type IN ('image', 'video', 'gif'))
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on events" ON public.events;
CREATE POLICY "Service role full access on events" ON public.events
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public read on events" ON public.events;
CREATE POLICY "Public read on events" ON public.events
    FOR SELECT TO anon, authenticated USING (is_published = true);

-- ============================================================
-- 16. MEMBERSHIP_PLANS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.membership_plans (
    plan_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    monthly_price NUMERIC(10,2) NOT NULL,
    benefits TEXT[] DEFAULT '{}',
    max_children INTEGER DEFAULT 1,
    visits_per_month INTEGER,
    discount_percent NUMERIC(5,2) DEFAULT 0,
    guest_passes_per_month INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.membership_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on membership_plans" ON public.membership_plans;
CREATE POLICY "Service role full access on membership_plans" ON public.membership_plans
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public read on membership_plans" ON public.membership_plans;
CREATE POLICY "Public read on membership_plans" ON public.membership_plans
    FOR SELECT TO anon, authenticated USING (is_active = true);

-- ============================================================
-- 17. MEMBERSHIPS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.memberships (
    membership_id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES public.customers(customer_id) ON DELETE CASCADE,
    plan_id INTEGER REFERENCES public.membership_plans(plan_id) ON DELETE SET NULL,
    tier VARCHAR(50) NOT NULL,
    status VARCHAR(30) DEFAULT 'active' NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    auto_renew BOOLEAN DEFAULT true,
    visits_per_month INTEGER,
    visits_used_this_period INTEGER DEFAULT 0,
    visit_period_start DATE,
    last_visit_at TIMESTAMPTZ,
    stripe_subscription_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on memberships" ON public.memberships;
CREATE POLICY "Service role full access on memberships" ON public.memberships
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated access on memberships" ON public.memberships;
CREATE POLICY "Authenticated access on memberships" ON public.memberships
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 18. MEMBERSHIP_REMINDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.membership_reminders (
    reminder_id SERIAL PRIMARY KEY,
    membership_id INTEGER NOT NULL REFERENCES public.memberships(membership_id) ON DELETE CASCADE,
    reminder_type VARCHAR(20) NOT NULL,
    sent_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    notification_method VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'sent' NOT NULL,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(membership_id, reminder_type)
);

ALTER TABLE public.membership_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on membership_reminders" ON public.membership_reminders;
CREATE POLICY "Service role full access on membership_reminders" ON public.membership_reminders
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated read on membership_reminders" ON public.membership_reminders;
CREATE POLICY "Authenticated read on membership_reminders" ON public.membership_reminders
    FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 19. ORDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.orders (
    order_id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES public.customers(customer_id) ON DELETE SET NULL,
    location_id INTEGER REFERENCES public.locations(location_id) ON DELETE SET NULL,
    order_type VARCHAR(30) DEFAULT 'Retail' NOT NULL,
    status VARCHAR(30) DEFAULT 'Pending' NOT NULL,
    subtotal_usd NUMERIC(10,2) DEFAULT 0 NOT NULL,
    discount_usd NUMERIC(10,2) DEFAULT 0 NOT NULL,
    tax_usd NUMERIC(10,2) DEFAULT 0 NOT NULL,
    total_usd NUMERIC(10,2) DEFAULT 0 NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on orders" ON public.orders;
CREATE POLICY "Service role full access on orders" ON public.orders
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated access on orders" ON public.orders;
CREATE POLICY "Authenticated access on orders" ON public.orders
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 20. PARTY_BOOKINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.party_bookings (
    booking_id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES public.customers(customer_id) ON DELETE SET NULL,
    package_id INTEGER REFERENCES public.party_packages(package_id) ON DELETE RESTRICT,
    reference VARCHAR(50) UNIQUE,
    event_date DATE,
    start_time VARCHAR(10),
    end_time VARCHAR(10),
    scheduled_start TIMESTAMPTZ,
    scheduled_end TIMESTAMPTZ,
    location_name VARCHAR(100),
    guests INTEGER DEFAULT 0,
    notes TEXT,
    add_ons JSONB DEFAULT '[]'::jsonb,
    subtotal NUMERIC(10,2) DEFAULT 0,
    cleaning_fee NUMERIC(10,2) DEFAULT 0,
    total NUMERIC(10,2) DEFAULT 0,
    deposit_amount NUMERIC(10,2) DEFAULT 0,
    balance_remaining NUMERIC(10,2) DEFAULT 0,
    status VARCHAR(30) DEFAULT 'Pending',
    payment_status VARCHAR(30) DEFAULT 'pending',
    deposit_paid_at TIMESTAMPTZ,
    latest_payment_intent_id VARCHAR(255),
    child_ids INTEGER[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add additional columns
ALTER TABLE public.party_bookings ADD COLUMN IF NOT EXISTS private_notes TEXT;
ALTER TABLE public.party_bookings ADD COLUMN IF NOT EXISTS payment_option VARCHAR(20) DEFAULT 'full';
ALTER TABLE public.party_bookings ADD COLUMN IF NOT EXISTS guest_name VARCHAR(200);
ALTER TABLE public.party_bookings ADD COLUMN IF NOT EXISTS guest_email VARCHAR(200);
ALTER TABLE public.party_bookings ADD COLUMN IF NOT EXISTS guest_phone VARCHAR(50);
ALTER TABLE public.party_bookings ADD COLUMN IF NOT EXISTS online_payment_amount NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.party_bookings ADD COLUMN IF NOT EXISTS venue_payment_amount NUMERIC(10,2) DEFAULT 0;

-- Add constraint for payment option (ignore if exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'party_bookings_payment_option_check') THEN
        ALTER TABLE public.party_bookings ADD CONSTRAINT party_bookings_payment_option_check CHECK (payment_option IN ('full', 'split'));
    END IF;
END $$;

ALTER TABLE public.party_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on party_bookings" ON public.party_bookings;
CREATE POLICY "Service role full access on party_bookings" ON public.party_bookings
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated access on party_bookings" ON public.party_bookings;
CREATE POLICY "Authenticated access on party_bookings" ON public.party_bookings
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 21. ORDER_ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.order_items (
    order_item_id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES public.orders(order_id) ON DELETE CASCADE,
    item_type VARCHAR(30) NOT NULL,
    product_id INTEGER,
    ticket_type_id INTEGER REFERENCES public.ticket_types(ticket_type_id) ON DELETE SET NULL,
    booking_id INTEGER REFERENCES public.party_bookings(booking_id) ON DELETE SET NULL,
    event_id INTEGER REFERENCES public.events(event_id) ON DELETE SET NULL,
    name_override VARCHAR(255),
    quantity INTEGER NOT NULL,
    unit_price_usd NUMERIC(10,2) NOT NULL,
    line_total_usd NUMERIC(10,2) NOT NULL
);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on order_items" ON public.order_items;
CREATE POLICY "Service role full access on order_items" ON public.order_items
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated access on order_items" ON public.order_items;
CREATE POLICY "Authenticated access on order_items" ON public.order_items
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 22. PAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payments (
    payment_id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES public.orders(order_id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    provider_payment_id VARCHAR(120),
    status VARCHAR(30) DEFAULT 'Pending' NOT NULL,
    amount_usd NUMERIC(10,2) NOT NULL,
    receipt_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on payments" ON public.payments;
CREATE POLICY "Service role full access on payments" ON public.payments
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated access on payments" ON public.payments;
CREATE POLICY "Authenticated access on payments" ON public.payments
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 23. WAIVER_USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.waiver_users (
    waiver_user_id SERIAL PRIMARY KEY,
    guardian_first_name VARCHAR(100) NOT NULL,
    guardian_last_name VARCHAR(100) NOT NULL,
    guardian_date_of_birth DATE,
    guardian_phone VARCHAR(50),
    guardian_email VARCHAR(200),
    relationship_to_minor VARCHAR(100),
    marketing_opt_in BOOLEAN DEFAULT false,
    last_waiver_signed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT waiver_users_contact_check CHECK (guardian_email IS NOT NULL OR guardian_phone IS NOT NULL)
);

ALTER TABLE public.waiver_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on waiver_users" ON public.waiver_users;
CREATE POLICY "Service role full access on waiver_users" ON public.waiver_users
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Anon insert on waiver_users" ON public.waiver_users;
CREATE POLICY "Anon insert on waiver_users" ON public.waiver_users
    FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated access on waiver_users" ON public.waiver_users;
CREATE POLICY "Authenticated access on waiver_users" ON public.waiver_users
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 24. WAIVER_USER_CHILDREN
-- ============================================================
CREATE TABLE IF NOT EXISTS public.waiver_user_children (
    waiver_user_child_id SERIAL PRIMARY KEY,
    waiver_user_id INTEGER NOT NULL REFERENCES public.waiver_users(waiver_user_id) ON DELETE CASCADE,
    minor_first_name VARCHAR(100) NOT NULL,
    minor_last_name VARCHAR(100),
    minor_date_of_birth DATE NOT NULL,
    minor_gender VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.waiver_user_children ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on waiver_user_children" ON public.waiver_user_children;
CREATE POLICY "Service role full access on waiver_user_children" ON public.waiver_user_children
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Anon insert on waiver_user_children" ON public.waiver_user_children;
CREATE POLICY "Anon insert on waiver_user_children" ON public.waiver_user_children
    FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated access on waiver_user_children" ON public.waiver_user_children;
CREATE POLICY "Authenticated access on waiver_user_children" ON public.waiver_user_children
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 25. WAIVER_SUBMISSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.waiver_submissions (
    submission_id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES public.customers(customer_id) ON DELETE SET NULL,
    waiver_user_id INTEGER REFERENCES public.waiver_users(waiver_user_id) ON DELETE SET NULL,
    guardian_first_name VARCHAR(100) NOT NULL,
    guardian_last_name VARCHAR(100) NOT NULL,
    guardian_date_of_birth DATE,
    guardian_phone VARCHAR(50),
    guardian_email VARCHAR(200),
    relationship_to_minor VARCHAR(100),
    child_ids INTEGER[] DEFAULT '{}',
    digital_signature TEXT NOT NULL,
    waiver_agreement_accepted BOOLEAN NOT NULL DEFAULT false,
    accepted_policies TEXT[] NOT NULL,
    marketing_sms_opt_in BOOLEAN DEFAULT false,
    marketing_email_opt_in BOOLEAN DEFAULT false,
    date_signed TIMESTAMPTZ DEFAULT now() NOT NULL,
    expires_at TIMESTAMPTZ,
    archive_until TIMESTAMPTZ,
    ip_address VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.waiver_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on waiver_submissions" ON public.waiver_submissions;
CREATE POLICY "Service role full access on waiver_submissions" ON public.waiver_submissions
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Anon insert on waiver_submissions" ON public.waiver_submissions;
CREATE POLICY "Anon insert on waiver_submissions" ON public.waiver_submissions
    FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated access on waiver_submissions" ON public.waiver_submissions;
CREATE POLICY "Authenticated access on waiver_submissions" ON public.waiver_submissions
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 26. WAIVER_VISITS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.waiver_visits (
    visit_id SERIAL PRIMARY KEY,
    waiver_user_id INTEGER NOT NULL REFERENCES public.waiver_users(waiver_user_id) ON DELETE CASCADE,
    waiver_submission_id INTEGER REFERENCES public.waiver_submissions(submission_id) ON DELETE SET NULL,
    visited_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.waiver_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on waiver_visits" ON public.waiver_visits;
CREATE POLICY "Service role full access on waiver_visits" ON public.waiver_visits
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated access on waiver_visits" ON public.waiver_visits;
CREATE POLICY "Authenticated access on waiver_visits" ON public.waiver_visits
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 27. TICKET_PURCHASES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ticket_purchases (
    purchase_id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES public.customers(customer_id) ON DELETE CASCADE,
    ticket_type_id INTEGER REFERENCES public.ticket_types(ticket_type_id) ON DELETE SET NULL,
    event_id INTEGER REFERENCES public.events(event_id) ON DELETE SET NULL,
    ticket_type VARCHAR(30) NOT NULL DEFAULT 'general',
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(10,2) NOT NULL,
    total NUMERIC(10,2) NOT NULL,
    codes JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(30) DEFAULT 'reserved' NOT NULL,
    metadata JSONB,
    stripe_payment_intent_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ticket_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on ticket_purchases" ON public.ticket_purchases;
CREATE POLICY "Service role full access on ticket_purchases" ON public.ticket_purchases
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated access on ticket_purchases" ON public.ticket_purchases;
CREATE POLICY "Authenticated access on ticket_purchases" ON public.ticket_purchases
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 28. APP_PAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_payments (
    app_payment_id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES public.customers(customer_id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'usd' NOT NULL,
    status VARCHAR(30) DEFAULT 'pending' NOT NULL,
    stripe_payment_intent_id VARCHAR(255) NOT NULL UNIQUE,
    purpose VARCHAR(50) NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.app_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on app_payments" ON public.app_payments;
CREATE POLICY "Service role full access on app_payments" ON public.app_payments
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated access on app_payments" ON public.app_payments;
CREATE POLICY "Authenticated access on app_payments" ON public.app_payments
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 29. EMAIL_OTPS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.email_otps (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    otp_code VARCHAR(6) NOT NULL,
    otp_type VARCHAR(50) NOT NULL DEFAULT 'email_verification',
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add registration_data column for pending registrations
ALTER TABLE public.email_otps ADD COLUMN IF NOT EXISTS registration_data JSONB;

ALTER TABLE public.email_otps DISABLE ROW LEVEL SECURITY;

GRANT ALL ON public.email_otps TO service_role;
GRANT ALL ON public.email_otps TO authenticated;
GRANT ALL ON public.email_otps TO anon;

-- ============================================================
-- 30. RECEIPTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.receipts (
    receipt_id SERIAL PRIMARY KEY,
    receipt_number VARCHAR(50) NOT NULL UNIQUE,
    customer_id INTEGER REFERENCES public.customers(customer_id) ON DELETE SET NULL,
    purchase_type VARCHAR(20) NOT NULL,
    reference_id INTEGER NOT NULL,
    subtotal_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
    discount_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
    tax_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
    payment_method VARCHAR(50),
    payment_id VARCHAR(255),
    verification_hash VARCHAR(64) NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT receipts_purchase_type_check CHECK (purchase_type IN ('membership', 'ticket', 'booking'))
);

ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on receipts" ON public.receipts;
CREATE POLICY "Service role full access on receipts" ON public.receipts
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated read on receipts" ON public.receipts;
CREATE POLICY "Authenticated read on receipts" ON public.receipts
    FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Anon read on receipts" ON public.receipts;
CREATE POLICY "Anon read on receipts" ON public.receipts
    FOR SELECT TO anon USING (true);

-- ============================================================
-- 31. PAYMENT_LOGS (Comprehensive Square Payment Tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payment_logs (
    log_id SERIAL PRIMARY KEY,
    -- Identifiers
    idempotency_key VARCHAR(100) NOT NULL,
    payment_id VARCHAR(100),
    order_id VARCHAR(100),
    -- Customer/Transaction Context
    customer_id INTEGER REFERENCES public.customers(customer_id) ON DELETE SET NULL,
    user_id INTEGER REFERENCES public.users(user_id) ON DELETE SET NULL,
    booking_id INTEGER,
    -- Transaction Details
    provider VARCHAR(20) NOT NULL DEFAULT 'square',
    payment_type VARCHAR(30) NOT NULL,
    amount_usd NUMERIC(10,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'USD',
    -- Status & Lifecycle
    status VARCHAR(30) NOT NULL,
    previous_status VARCHAR(30),
    -- Request Details
    source_type VARCHAR(50),
    location_id VARCHAR(100),
    reference_id VARCHAR(100),
    -- Response & Error Details
    response_code VARCHAR(50),
    error_category VARCHAR(50),
    error_code VARCHAR(100),
    error_detail TEXT,
    error_field VARCHAR(100),
    -- Square-specific details
    square_receipt_number VARCHAR(100),
    square_receipt_url TEXT,
    card_brand VARCHAR(30),
    card_last4 VARCHAR(4),
    card_exp_month INTEGER,
    card_exp_year INTEGER,
    entry_method VARCHAR(50),
    cvv_status VARCHAR(30),
    avs_status VARCHAR(30),
    -- Risk & Verification
    risk_level VARCHAR(20),
    risk_score INTEGER,
    verification_method VARCHAR(50),
    -- Timing
    processing_time_ms INTEGER,
    -- Full Request/Response (for debugging)
    request_payload JSONB,
    response_payload JSONB,
    -- Metadata
    ip_address VARCHAR(64),
    user_agent TEXT,
    session_id VARCHAR(100),
    metadata JSONB DEFAULT '{}'::jsonb,
    -- Timestamps
    initiated_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Add comments for documentation
COMMENT ON TABLE public.payment_logs IS 'Comprehensive payment logging for Square transactions - tracks all payment attempts, successes, and failures';
COMMENT ON COLUMN public.payment_logs.idempotency_key IS 'Unique key to prevent duplicate payments';
COMMENT ON COLUMN public.payment_logs.error_category IS 'Square error category: API_ERROR, AUTHENTICATION_ERROR, INVALID_REQUEST_ERROR, RATE_LIMIT_ERROR, PAYMENT_METHOD_ERROR, REFUND_ERROR';
COMMENT ON COLUMN public.payment_logs.error_code IS 'Square-specific error code like INSUFFICIENT_FUNDS, CARD_DECLINED, CVV_FAILURE, etc.';
COMMENT ON COLUMN public.payment_logs.request_payload IS 'Full request sent to Square (sensitive data should be masked)';
COMMENT ON COLUMN public.payment_logs.response_payload IS 'Full response from Square including errors';

ALTER TABLE public.payment_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on payment_logs" ON public.payment_logs;
CREATE POLICY "Service role full access on payment_logs" ON public.payment_logs
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Admin read on payment_logs" ON public.payment_logs;
CREATE POLICY "Admin read on payment_logs" ON public.payment_logs
    FOR SELECT TO authenticated USING (true);

-- ============================================================
-- SLOT RESERVATIONS TABLE
-- Prevents double-booking by temporarily reserving time slots during checkout
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'slot_reservations') THEN
    CREATE TABLE slot_reservations (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      slot_date DATE NOT NULL,
      slot_time TIME NOT NULL,
      location_name VARCHAR(255) NOT NULL,
      user_id INT REFERENCES users(user_id) ON DELETE SET NULL,
      session_id VARCHAR(255) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'expired', 'cancelled')),
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      confirmed_at TIMESTAMPTZ,
      booking_id INT REFERENCES party_bookings(booking_id) ON DELETE SET NULL,
      CONSTRAINT slot_reservations_identity_check CHECK (user_id IS NOT NULL OR booking_id IS NOT NULL)
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'slot_reservations' AND column_name = 'booking_id') THEN
    ALTER TABLE slot_reservations ADD COLUMN booking_id INT REFERENCES party_bookings(booking_id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON TABLE slot_reservations IS 'Temporary slot reservations to prevent double-booking during checkout';

-- ============================================================
-- WEBHOOK EVENTS TABLE
-- Ensures idempotent processing of Square webhooks
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'webhook_events') THEN
    CREATE TABLE webhook_events (
      id SERIAL PRIMARY KEY,
      event_id VARCHAR(255) UNIQUE NOT NULL,
      event_type VARCHAR(100) NOT NULL,
      payload JSONB NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processing', 'processed', 'failed')),
      error_message TEXT,
      retry_count INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      processed_at TIMESTAMPTZ
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'webhook_events' AND column_name = 'error_message') THEN
    ALTER TABLE webhook_events ADD COLUMN error_message TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'webhook_events' AND column_name = 'retry_count') THEN
    ALTER TABLE webhook_events ADD COLUMN retry_count INT DEFAULT 0;
  END IF;
END $$;

COMMENT ON TABLE webhook_events IS 'Idempotent storage of Square webhook events';

-- ============================================================
-- NOTIFICATION QUEUE TABLE
-- Reliable email/SMS delivery with exponential backoff retry
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notification_queue') THEN
    CREATE TABLE notification_queue (
      id SERIAL PRIMARY KEY,
      type VARCHAR(50) NOT NULL CHECK (type IN ('email', 'sms')),
      recipient VARCHAR(255) NOT NULL,
      subject VARCHAR(500),
      template VARCHAR(100) NOT NULL,
      payload JSONB NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
      attempts INT DEFAULT 0,
      max_attempts INT DEFAULT 3,
      next_attempt_at TIMESTAMPTZ DEFAULT NOW(),
      sent_at TIMESTAMPTZ,
      last_error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      reference_type VARCHAR(50),
      reference_id INT
    );
  END IF;
END $$;

COMMENT ON TABLE notification_queue IS 'Reliable notification delivery with retry support';

-- ============================================================
-- INDEXES (using IF NOT EXISTS)
-- ============================================================
CREATE INDEX IF NOT EXISTS ix_store_hours_location_day ON public.store_hours(location_name, day_of_week);
CREATE INDEX IF NOT EXISTS ix_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS ix_users_customer ON public.users(customer_id);
CREATE INDEX IF NOT EXISTS ix_users_phone ON public.users(phone);
CREATE INDEX IF NOT EXISTS ix_users_auth_user_id ON public.users(auth_user_id);
CREATE INDEX IF NOT EXISTS ix_children_customer ON public.children(customer_id);
CREATE INDEX IF NOT EXISTS ix_events_location ON public.events(location_id);
CREATE INDEX IF NOT EXISTS ix_events_published ON public.events(is_published);
CREATE INDEX IF NOT EXISTS ix_events_dates ON public.events(start_date, end_date);
CREATE INDEX IF NOT EXISTS ix_memberships_customer ON public.memberships(customer_id);
CREATE INDEX IF NOT EXISTS ix_memberships_status ON public.memberships(status);
CREATE INDEX IF NOT EXISTS ix_announcements_active ON public.announcements(is_active);
CREATE INDEX IF NOT EXISTS ix_waiver_users_email ON public.waiver_users(guardian_email);
CREATE INDEX IF NOT EXISTS ix_waiver_users_phone ON public.waiver_users(guardian_phone);
CREATE INDEX IF NOT EXISTS ix_waiver_users_name ON public.waiver_users(guardian_last_name, guardian_first_name);
CREATE INDEX IF NOT EXISTS ix_waiver_user_children_user ON public.waiver_user_children(waiver_user_id);
CREATE INDEX IF NOT EXISTS ix_waiver_submissions_customer ON public.waiver_submissions(customer_id);
CREATE INDEX IF NOT EXISTS ix_waiver_submissions_waiver_user ON public.waiver_submissions(waiver_user_id);
CREATE INDEX IF NOT EXISTS ix_waiver_submissions_date_signed ON public.waiver_submissions(date_signed DESC);
CREATE INDEX IF NOT EXISTS ix_waiver_user_children_name ON public.waiver_user_children(minor_last_name, minor_first_name);
CREATE INDEX IF NOT EXISTS ix_waiver_visits_user ON public.waiver_visits(waiver_user_id);
CREATE INDEX IF NOT EXISTS ix_waiver_visits_date ON public.waiver_visits(visited_at DESC);
CREATE INDEX IF NOT EXISTS ix_ticket_purchases_customer ON public.ticket_purchases(customer_id);
CREATE INDEX IF NOT EXISTS ix_ticket_purchases_event ON public.ticket_purchases(event_id);
CREATE INDEX IF NOT EXISTS ix_app_payments_customer ON public.app_payments(customer_id);
CREATE INDEX IF NOT EXISTS ix_party_bookings_reference ON public.party_bookings(reference);
CREATE INDEX IF NOT EXISTS ix_party_bookings_event_date ON public.party_bookings(event_date);
CREATE INDEX IF NOT EXISTS ix_party_bookings_guest_email ON public.party_bookings(guest_email);
CREATE INDEX IF NOT EXISTS ix_party_bookings_payment_option ON public.party_bookings(payment_option);
CREATE INDEX IF NOT EXISTS ix_payments_order ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS ix_order_items_order ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS ix_party_add_ons_active ON public.party_add_ons(is_active);
CREATE INDEX IF NOT EXISTS ix_party_add_ons_code ON public.party_add_ons(code);
CREATE INDEX IF NOT EXISTS ix_pricing_config_key ON public.pricing_config(config_key);
CREATE INDEX IF NOT EXISTS ix_membership_reminders_membership ON public.membership_reminders(membership_id);
CREATE INDEX IF NOT EXISTS ix_membership_reminders_sent_at ON public.membership_reminders(sent_at);
CREATE INDEX IF NOT EXISTS idx_email_otps_email ON public.email_otps(email);
CREATE INDEX IF NOT EXISTS idx_email_otps_expires ON public.email_otps(expires_at);
CREATE INDEX IF NOT EXISTS idx_customers_is_guest ON public.customers(is_guest) WHERE is_guest = true;
CREATE INDEX IF NOT EXISTS idx_customers_email ON public.customers(email);
CREATE INDEX IF NOT EXISTS ix_receipts_receipt_number ON public.receipts(receipt_number);
CREATE INDEX IF NOT EXISTS ix_receipts_customer ON public.receipts(customer_id);
CREATE INDEX IF NOT EXISTS ix_receipts_purchase_type ON public.receipts(purchase_type);
CREATE INDEX IF NOT EXISTS ix_receipts_created_at ON public.receipts(created_at DESC);
CREATE INDEX IF NOT EXISTS ix_payment_logs_idempotency ON public.payment_logs(idempotency_key);
CREATE INDEX IF NOT EXISTS ix_payment_logs_payment_id ON public.payment_logs(payment_id);
CREATE INDEX IF NOT EXISTS ix_payment_logs_customer ON public.payment_logs(customer_id);
CREATE INDEX IF NOT EXISTS ix_payment_logs_booking ON public.payment_logs(booking_id);
CREATE INDEX IF NOT EXISTS ix_payment_logs_status ON public.payment_logs(status);
CREATE INDEX IF NOT EXISTS ix_payment_logs_error ON public.payment_logs(error_code) WHERE error_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_payment_logs_created ON public.payment_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS ix_payment_logs_initiated ON public.payment_logs(initiated_at DESC);

-- Slot reservations indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_reservation
  ON slot_reservations(slot_date, slot_time, location_name)
  WHERE status IN ('pending', 'confirmed');
CREATE INDEX IF NOT EXISTS idx_reservations_expires
  ON slot_reservations(expires_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_reservations_user
  ON slot_reservations(user_id)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reservations_session
  ON slot_reservations(session_id);

-- Webhook events indexes
CREATE INDEX IF NOT EXISTS idx_webhook_events_status
  ON webhook_events(status, created_at)
  WHERE status IN ('received', 'processing', 'failed');
CREATE INDEX IF NOT EXISTS idx_webhook_events_type
  ON webhook_events(event_type);

-- Notification queue indexes
CREATE INDEX IF NOT EXISTS idx_notification_queue_pending
  ON notification_queue(next_attempt_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_notification_queue_reference
  ON notification_queue(reference_type, reference_id);

-- ============================================================
-- 32. REFUNDS (Square payment refunds tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.refunds (
    refund_id SERIAL PRIMARY KEY,
    square_refund_id VARCHAR(100) UNIQUE,
    square_payment_id VARCHAR(100) NOT NULL,
    order_id INTEGER REFERENCES public.orders(order_id) ON DELETE SET NULL,
    payment_id INTEGER REFERENCES public.payments(payment_id) ON DELETE SET NULL,
    booking_id INTEGER REFERENCES public.party_bookings(booking_id) ON DELETE SET NULL,
    amount_cents INTEGER NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    status VARCHAR(30) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'rejected')),
    reason VARCHAR(500),
    initiated_by INTEGER REFERENCES public.users(user_id) ON DELETE SET NULL,
    idempotency_key VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    processed_at TIMESTAMPTZ,
    error_code VARCHAR(100),
    error_message TEXT
);

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on refunds" ON public.refunds;
CREATE POLICY "Service role full access on refunds" ON public.refunds
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated read on refunds" ON public.refunds;
CREATE POLICY "Authenticated read on refunds" ON public.refunds
    FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_refunds_square_payment_id ON public.refunds(square_payment_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON public.refunds(status);
CREATE INDEX IF NOT EXISTS idx_refunds_order_id ON public.refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_booking_id ON public.refunds(booking_id);

-- ============================================================
-- FUNCTIONS
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_memberships_needing_reminders()
RETURNS TABLE (
    membership_id INTEGER,
    customer_id INTEGER,
    tier VARCHAR,
    end_date DATE,
    reminder_type VARCHAR,
    customer_email VARCHAR,
    customer_phone VARCHAR,
    customer_name VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.membership_id,
        m.customer_id,
        m.tier,
        m.end_date,
        CASE
            WHEN m.end_date = CURRENT_DATE + INTERVAL '30 days' THEN 'one_month'::varchar
            WHEN m.end_date = CURRENT_DATE + INTERVAL '7 days' THEN 'one_week'::varchar
            WHEN m.end_date = CURRENT_DATE + INTERVAL '1 day' THEN 'one_day'::varchar
        END as reminder_type,
        c.email as customer_email,
        c.phone as customer_phone,
        c.full_name as customer_name
    FROM public.memberships m
    JOIN public.customers c ON m.customer_id = c.customer_id
    WHERE
        m.status = 'active'
        AND m.end_date IS NOT NULL
        AND (
            m.end_date = CURRENT_DATE + INTERVAL '30 days'
            OR m.end_date = CURRENT_DATE + INTERVAL '7 days'
            OR m.end_date = CURRENT_DATE + INTERVAL '1 day'
        )
        AND NOT EXISTS (
            SELECT 1 FROM public.membership_reminders mr
            WHERE mr.membership_id = m.membership_id
            AND mr.reminder_type = CASE
                WHEN m.end_date = CURRENT_DATE + INTERVAL '30 days' THEN 'one_month'
                WHEN m.end_date = CURRENT_DATE + INTERVAL '7 days' THEN 'one_week'
                WHEN m.end_date = CURRENT_DATE + INTERVAL '1 day' THEN 'one_day'
            END
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.record_membership_reminder(
    p_membership_id INTEGER,
    p_reminder_type VARCHAR,
    p_notification_method VARCHAR,
    p_status VARCHAR DEFAULT 'sent',
    p_error_message TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.membership_reminders (
        membership_id, reminder_type, notification_method, status, error_message
    ) VALUES (
        p_membership_id, p_reminder_type, p_notification_method, p_status, p_error_message
    )
    ON CONFLICT (membership_id, reminder_type)
    DO UPDATE SET
        sent_at = now(),
        notification_method = p_notification_method,
        status = p_status,
        error_message = p_error_message;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.process_membership_reminders()
RETURNS TABLE (
    membership_id INTEGER,
    customer_id INTEGER,
    customer_name VARCHAR,
    customer_email VARCHAR,
    customer_phone VARCHAR,
    tier VARCHAR,
    end_date DATE,
    reminder_type VARCHAR,
    days_remaining INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.membership_id,
        m.customer_id,
        c.full_name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone,
        m.tier,
        m.end_date,
        CASE
            WHEN m.end_date = CURRENT_DATE + INTERVAL '30 days' THEN 'one_month'::varchar
            WHEN m.end_date = CURRENT_DATE + INTERVAL '7 days' THEN 'one_week'::varchar
            WHEN m.end_date = CURRENT_DATE + INTERVAL '1 day' THEN 'one_day'::varchar
        END as reminder_type,
        (m.end_date - CURRENT_DATE)::integer as days_remaining
    FROM public.memberships m
    JOIN public.customers c ON m.customer_id = c.customer_id
    WHERE
        m.status = 'active'
        AND m.end_date IS NOT NULL
        AND (
            m.end_date = CURRENT_DATE + INTERVAL '30 days'
            OR m.end_date = CURRENT_DATE + INTERVAL '7 days'
            OR m.end_date = CURRENT_DATE + INTERVAL '1 day'
        )
        AND NOT EXISTS (
            SELECT 1 FROM public.membership_reminders mr
            WHERE mr.membership_id = m.membership_id
            AND mr.reminder_type = CASE
                WHEN m.end_date = CURRENT_DATE + INTERVAL '30 days' THEN 'one_month'
                WHEN m.end_date = CURRENT_DATE + INTERVAL '7 days' THEN 'one_week'
                WHEN m.end_date = CURRENT_DATE + INTERVAL '1 day' THEN 'one_day'
            END
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Supabase Auth trigger function
-- NOTE: This trigger ONLY links existing users to Supabase Auth.
-- It does NOT create new users - users must go through the sign-up flow.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Only link existing users to Supabase Auth, do NOT create new users
    IF EXISTS (SELECT 1 FROM public.users WHERE email = NEW.email) THEN
        UPDATE public.users
        SET auth_user_id = NEW.id, updated_at = NOW()
        WHERE email = NEW.email;
    END IF;
    -- For new users: do nothing here - they must use the sign-up flow
    -- which will create the user record with proper name extraction
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ============================================================
-- GRANTS FOR FUNCTIONS
-- ============================================================
GRANT EXECUTE ON FUNCTION public.get_memberships_needing_reminders() TO service_role;
GRANT EXECUTE ON FUNCTION public.record_membership_reminder(INTEGER, VARCHAR, VARCHAR, VARCHAR, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_membership_reminders() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_auth_user() TO service_role;

-- ============================================================
-- SLOT RESERVATION FUNCTIONS
-- Atomically reserve booking slots to prevent double-booking
-- ============================================================

CREATE OR REPLACE FUNCTION reserve_slot(
  p_slot_date DATE,
  p_slot_time TIME,
  p_location_name VARCHAR(255),
  p_user_id INT,
  p_session_id VARCHAR(255),
  p_timeout_minutes INT DEFAULT 5
)
RETURNS TABLE(
  reservation_id UUID,
  expires_at TIMESTAMPTZ,
  success BOOLEAN,
  error_message TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_expires_at TIMESTAMPTZ;
  v_reservation_id UUID;
  v_existing_id UUID;
BEGIN
  v_expires_at := NOW() + (p_timeout_minutes || ' minutes')::INTERVAL;

  -- First, clean up any expired reservations for this slot
  -- Use table alias 'sr' to avoid ambiguous column references with return table
  UPDATE slot_reservations sr
  SET status = 'expired'
  WHERE sr.slot_date = p_slot_date
    AND sr.slot_time = p_slot_time
    AND sr.location_name = p_location_name
    AND sr.status = 'pending'
    AND sr.expires_at < NOW();

  -- Try to lock any existing active reservation
  SELECT sr.id INTO v_existing_id
  FROM slot_reservations sr
  WHERE sr.slot_date = p_slot_date
    AND sr.slot_time = p_slot_time
    AND sr.location_name = p_location_name
    AND sr.status IN ('pending', 'confirmed')
    AND (sr.status = 'confirmed' OR sr.expires_at > NOW())
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN QUERY SELECT
      NULL::UUID,
      NULL::TIMESTAMPTZ,
      FALSE,
      'Slot is no longer available'::TEXT;
    RETURN;
  END IF;

  INSERT INTO slot_reservations (
    slot_date,
    slot_time,
    location_name,
    user_id,
    session_id,
    status,
    expires_at
  ) VALUES (
    p_slot_date,
    p_slot_time,
    p_location_name,
    p_user_id,
    p_session_id,
    'pending',
    v_expires_at
  )
  RETURNING id INTO v_reservation_id;

  RETURN QUERY SELECT
    v_reservation_id,
    v_expires_at,
    TRUE,
    NULL::TEXT;

EXCEPTION WHEN unique_violation THEN
  RETURN QUERY SELECT
    NULL::UUID,
    NULL::TIMESTAMPTZ,
    FALSE,
    'Slot was just reserved by another user'::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION confirm_reservation(
  p_reservation_id UUID,
  p_booking_id INT DEFAULT NULL
)
RETURNS TABLE(
  success BOOLEAN,
  error_message TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_status VARCHAR(20);
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Use table alias to avoid ambiguous column references
  SELECT sr.status, sr.expires_at INTO v_status, v_expires_at
  FROM slot_reservations sr
  WHERE sr.id = p_reservation_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Reservation not found'::TEXT;
    RETURN;
  END IF;

  IF v_status = 'confirmed' THEN
    RETURN QUERY SELECT TRUE, NULL::TEXT;
    RETURN;
  END IF;

  IF v_status != 'pending' THEN
    RETURN QUERY SELECT FALSE, ('Reservation is ' || v_status)::TEXT;
    RETURN;
  END IF;

  IF v_expires_at < NOW() THEN
    UPDATE slot_reservations SET status = 'expired' WHERE id = p_reservation_id;
    RETURN QUERY SELECT FALSE, 'Reservation has expired'::TEXT;
    RETURN;
  END IF;

  UPDATE slot_reservations
  SET status = 'confirmed',
      confirmed_at = NOW(),
      booking_id = p_booking_id
  WHERE id = p_reservation_id;

  RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION cleanup_expired_reservations()
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INT;
BEGIN
  -- Use table alias sr to avoid any potential ambiguity
  UPDATE slot_reservations sr
  SET status = 'expired'
  WHERE sr.status = 'pending'
    AND sr.expires_at < NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION process_booking_deposit(
  p_booking_id INT,
  p_expected_status VARCHAR(50) DEFAULT 'pending'
)
RETURNS TABLE(
  success BOOLEAN,
  error_message TEXT,
  current_status VARCHAR(50)
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_status VARCHAR(50);
  v_payment_status VARCHAR(50);
BEGIN
  -- Lock the booking row to prevent concurrent updates
  SELECT status, payment_status INTO v_status, v_payment_status
  FROM party_bookings
  WHERE booking_id = p_booking_id
  FOR UPDATE;

  IF v_payment_status IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Booking not found'::TEXT, NULL::VARCHAR(50);
    RETURN;
  END IF;

  -- Check if deposit is already paid
  IF v_payment_status = 'deposit_paid' OR v_payment_status = 'paid' THEN
    RETURN QUERY SELECT FALSE, 'Deposit already paid for this booking'::TEXT, v_payment_status;
    RETURN;
  END IF;

  -- Check expected status (optimistic locking)
  IF v_payment_status != p_expected_status THEN
    RETURN QUERY SELECT FALSE, ('Payment status changed: expected ' || p_expected_status || ', got ' || v_payment_status)::TEXT, v_payment_status;
    RETURN;
  END IF;

  -- Return success - caller will update after payment succeeds
  RETURN QUERY SELECT TRUE, NULL::TEXT, v_payment_status;
END;
$$;

CREATE OR REPLACE FUNCTION complete_booking_deposit(
  p_booking_id INT,
  p_payment_intent_id VARCHAR(255),
  p_balance_remaining DECIMAL(10, 2)
)
RETURNS TABLE(
  success BOOLEAN,
  error_message TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_payment_status VARCHAR(50);
BEGIN
  -- Lock and check current status
  SELECT payment_status INTO v_payment_status
  FROM party_bookings
  WHERE booking_id = p_booking_id
  FOR UPDATE;

  IF v_payment_status IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Booking not found'::TEXT;
    RETURN;
  END IF;

  -- Double-check deposit not already paid (race condition safety)
  IF v_payment_status = 'deposit_paid' OR v_payment_status = 'paid' THEN
    RETURN QUERY SELECT FALSE, 'Deposit already paid'::TEXT;
    RETURN;
  END IF;

  -- Update to deposit_paid
  UPDATE party_bookings
  SET payment_status = 'deposit_paid',
      status = 'Confirmed',
      balance_remaining = p_balance_remaining,
      deposit_paid_at = NOW(),
      latest_payment_intent_id = p_payment_intent_id
  WHERE booking_id = p_booking_id;

  RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$;

COMMENT ON FUNCTION reserve_slot IS 'Atomically reserve a booking slot with race condition protection';
COMMENT ON FUNCTION confirm_reservation IS 'Confirm a reservation after successful payment';
COMMENT ON FUNCTION cleanup_expired_reservations IS 'Mark expired pending reservations - call via cron every minute';
COMMENT ON FUNCTION process_booking_deposit IS 'Lock booking row and verify deposit not already paid';
COMMENT ON FUNCTION complete_booking_deposit IS 'Atomically complete deposit payment with race condition protection';

-- ============================================================
-- MEMBERSHIP VISIT & PROMOTION REDEMPTION FUNCTIONS
-- Atomic operations to prevent race conditions
-- ============================================================

CREATE OR REPLACE FUNCTION public.record_membership_visit(
  p_membership_id INTEGER,
  p_visits_per_month INTEGER
)
RETURNS SETOF public.memberships
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_visits INTEGER;
BEGIN
  -- Lock the row for update
  SELECT visits_used_this_period INTO v_current_visits
  FROM public.memberships
  WHERE membership_id = p_membership_id
  FOR UPDATE;

  IF v_current_visits IS NULL THEN
    RAISE EXCEPTION 'Membership not found: %', p_membership_id;
  END IF;

  -- Check if within limit
  IF v_current_visits >= p_visits_per_month THEN
    RETURN; -- Return empty set = visit limit reached
  END IF;

  -- Atomically increment and return updated row
  RETURN QUERY
  UPDATE public.memberships
  SET visits_used_this_period = COALESCE(visits_used_this_period, 0) + 1,
      last_visit_at = NOW(),
      updated_at = NOW()
  WHERE membership_id = p_membership_id
  RETURNING *;
END;
$$;

COMMENT ON FUNCTION public.record_membership_visit IS 'Atomically record a membership visit - increments only if under monthly limit';

CREATE OR REPLACE FUNCTION public.increment_promotion_redemptions(
  p_promotion_id INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_max_redemptions INTEGER;
  v_current_redemptions INTEGER;
BEGIN
  -- Lock the row for update
  SELECT max_redemptions, COALESCE(redemptions, 0)
  INTO v_max_redemptions, v_current_redemptions
  FROM public.promotions
  WHERE promotion_id = p_promotion_id
  FOR UPDATE;

  IF v_max_redemptions IS NULL AND v_current_redemptions IS NULL THEN
    RAISE EXCEPTION 'Promotion not found: %', p_promotion_id;
  END IF;

  -- Check if max redemptions reached (NULL means unlimited)
  IF v_max_redemptions IS NOT NULL AND v_current_redemptions >= v_max_redemptions THEN
    RAISE EXCEPTION 'Promotion has reached maximum redemptions';
  END IF;

  -- Atomically increment
  UPDATE public.promotions
  SET redemptions = COALESCE(redemptions, 0) + 1
  WHERE promotion_id = p_promotion_id;
END;
$$;

COMMENT ON FUNCTION public.increment_promotion_redemptions IS 'Atomically increment promotion redemption count with max limit check';

GRANT EXECUTE ON FUNCTION public.record_membership_visit(INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_promotion_redemptions(INTEGER) TO service_role;

-- ============================================================
-- GRANTS FOR ALL TABLES AND SEQUENCES
-- ============================================================
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;

-- ============================================================
-- SEED DATA (using ON CONFLICT to avoid duplicates)
-- ============================================================

-- Membership plans
INSERT INTO public.membership_plans (name, description, monthly_price, benefits, max_children, visits_per_month, discount_percent, guest_passes_per_month)
VALUES
    ('Silver', 'Great for light play families with weekday flexibility.', 79.00, ARRAY['8 visits / month', '5% off parties & camps', '1 guest pass each month'], 2, 8, 5.00, 1),
    ('Gold', 'Perfect for active families that come every week.', 119.00, ARRAY['12 visits / month', '10% off parties & camps', '2 guest passes each month'], 3, 12, 10.00, 2),
    ('Platinum', 'Frequent play plus VIP booking perks.', 159.00, ARRAY['16 visits / month', '15% off parties & camps', '3 guest passes each month'], 4, 16, 15.00, 3),
    ('VIP Platinum', 'Unlimited visits, early access events, and biggest perks.', 199.00, ARRAY['Unlimited visits', '20% off parties & camps', '4 guest passes each month', 'Priority event access'], 5, NULL, 20.00, 4)
ON CONFLICT (name) DO NOTHING;

-- Ticket types
INSERT INTO public.ticket_types (name, description, base_price_usd, child_count, requires_waiver, requires_grip_socks)
VALUES
    ('Single Play Pass', 'One child plus one supporting adult', 20.00, 1, true, true),
    ('Sibling Duo Bundle', 'Perfect for two siblings or cousins', 35.00, 2, true, true),
    ('Bestie Trio Bundle', 'Three kids, one price-friendly bundle', 50.00, 3, true, true),
    ('Additional Child', 'Extra child beyond bundle', 15.00, 1, true, true),
    ('Grip Socks', 'Required grip socks for play', 3.00, 0, false, false)
ON CONFLICT DO NOTHING;

-- Party packages
INSERT INTO public.party_packages (name, description, price_usd, base_children, base_room_hours, includes_food, includes_drinks, includes_decor)
VALUES
    ('Mini Fun', 'Basic party package - play time only', 399.00, 10, 2.0, false, false, false),
    ('Super Fun', 'Party with pizza and drinks', 599.00, 10, 2.0, true, true, false),
    ('Mega Fun', 'Full party with themed decor', 699.00, 10, 2.0, true, true, true),
    ('Ultra Fun', 'Extended playtime plus cake', 799.00, 10, 2.5, true, true, true),
    ('Deluxe Fun', 'VIP experience with party host', 899.00, 12, 3.0, true, true, true)
ON CONFLICT DO NOTHING;

-- Party add-ons
INSERT INTO public.party_add_ons (code, label, description, price, price_type, display_order)
VALUES
    ('extra_hour', 'Extra Hour', 'Extend your party by one hour', 100.00, 'duration', 1),
    ('extra_child', 'Extra Child', 'Additional child beyond base package', 40.00, 'perChild', 2),
    ('extra_adult', 'Extra Adult', 'Additional adult beyond base package', 10.00, 'flat', 3),
    ('face_painting', 'Face Painting', 'Professional face painting for all guests', 100.00, 'flat', 4),
    ('photo_video', 'Photo & Video', 'Professional photography and videography', 250.00, 'flat', 5),
    ('balloon_artist', 'Balloon Artist', 'Balloon sculptures for all guests', 150.00, 'flat', 6),
    ('character_visit', 'Character Visit', 'Special character appearance at your party', 200.00, 'flat', 7)
ON CONFLICT (code) DO NOTHING;

-- Pricing config
-- Note: extra_child_fee and extra_adult_fee are stored in party_add_ons table (not here)
INSERT INTO public.pricing_config (config_key, config_value, description)
VALUES
    ('tax_rate', 8.00, 'Tax rate as percentage (e.g., 8 for 8%)'),
    ('cleaning_fee', 50.00, 'Standard cleaning fee for party bookings'),
    ('grip_socks_price', 3.00, 'Price per pair of grip socks'),
    ('single_admission_price', 20.00, 'Price for single child admission ticket'),
    ('extra_adult_admission_price', 5.00, 'Price for extra adult admission with ticket'),
    ('extra_child_admission', 15.00, 'Price per additional child beyond trio bundle'),
    ('deposit_percentage', 50.00, 'Deposit percentage for party bookings'),
    ('sibling_discount_rate', 5.00, 'Discount percentage for sibling bookings')
ON CONFLICT (config_key) DO NOTHING;

-- Location
INSERT INTO public.locations (name, address, city, state, postal_code, phone, email)
VALUES ('Albany', '1 Crossgates Mall Rd, Unit N202, Level 2, Near Macy''s', 'Albany', 'NY', '12203', '+1 (201) 539-5928', 'info@playfunia.com')
ON CONFLICT DO NOTHING;

-- Store Hours (Albany location)
-- Sun: 11AM-6PM, Mon-Thu: 10AM-8PM, Fri-Sat: 10AM-9PM
INSERT INTO public.store_hours (location_name, day_of_week, open_time, close_time)
VALUES
    ('Albany', 0, '11:00', '18:00'),  -- Sunday: 11am - 6pm
    ('Albany', 1, '10:00', '20:00'),  -- Monday: 10am - 8pm
    ('Albany', 2, '10:00', '20:00'),  -- Tuesday: 10am - 8pm
    ('Albany', 3, '10:00', '20:00'),  -- Wednesday: 10am - 8pm
    ('Albany', 4, '10:00', '20:00'),  -- Thursday: 10am - 8pm
    ('Albany', 5, '10:00', '21:00'),  -- Friday: 10am - 9pm
    ('Albany', 6, '10:00', '21:00')   -- Saturday: 10am - 9pm
ON CONFLICT (location_name, day_of_week) DO UPDATE SET
    open_time = EXCLUDED.open_time,
    close_time = EXCLUDED.close_time,
    updated_at = now();

-- Admin users
INSERT INTO public.customers (full_name, email, created_at, updated_at)
VALUES
    ('Emel Gumustop', 'emelgumustop@hotmail.com', NOW(), NOW()),
    ('Playfunia Admin', 'playfunia@playfunia.com', NOW(), NOW())
ON CONFLICT DO NOTHING;

INSERT INTO public.users (email, first_name, last_name, roles, customer_id)
VALUES
    ('emelgumustop@hotmail.com', 'Emel', 'Gumustop', ARRAY['user', 'admin']::text[], (SELECT customer_id FROM public.customers WHERE email = 'emelgumustop@hotmail.com' LIMIT 1)),
    ('playfunia@playfunia.com', 'Playfunia', 'Admin', ARRAY['user', 'admin']::text[], (SELECT customer_id FROM public.customers WHERE email = 'playfunia@playfunia.com' LIMIT 1))
ON CONFLICT (email) DO UPDATE SET roles = ARRAY['user', 'admin']::text[], updated_at = NOW();

-- ============================================================
-- JOB LISTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.job_listings (
    listing_id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    slug VARCHAR(200) UNIQUE NOT NULL,
    department VARCHAR(100) NOT NULL,
    employment_type VARCHAR(30) NOT NULL CHECK (employment_type IN ('full-time', 'part-time', 'seasonal', 'internship')),
    location VARCHAR(200) NOT NULL DEFAULT 'Crossgates Mall, Albany, NY',
    description TEXT NOT NULL,
    responsibilities TEXT[] DEFAULT '{}',
    qualifications TEXT[] DEFAULT '{}',
    nice_to_have TEXT[] DEFAULT '{}',
    perks TEXT[] DEFAULT '{}',
    pay_range VARCHAR(100),
    minimum_age INTEGER DEFAULT 16,
    schedule_notes VARCHAR(200),
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    published_at TIMESTAMPTZ DEFAULT now(),
    closes_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_listings_active_order ON public.job_listings (is_active, display_order);
CREATE INDEX IF NOT EXISTS idx_job_listings_slug ON public.job_listings (slug);

-- RLS for job_listings
ALTER TABLE public.job_listings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "job_listings_public_read" ON public.job_listings;
CREATE POLICY "job_listings_public_read" ON public.job_listings
    FOR SELECT USING (is_active = true);
DROP POLICY IF EXISTS "job_listings_service_all" ON public.job_listings;
CREATE POLICY "job_listings_service_all" ON public.job_listings
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- JOB APPLICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.job_applications (
    application_id SERIAL PRIMARY KEY,
    listing_id INTEGER NOT NULL REFERENCES public.job_listings(listing_id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    date_of_birth DATE,
    resume_storage_path TEXT,
    resume_original_name VARCHAR(255),
    resume_mime_type VARCHAR(100),
    resume_size_bytes INTEGER,
    cover_letter TEXT,
    schedule_preference VARCHAR(100),
    available_start_date DATE,
    has_experience_with_children BOOLEAN DEFAULT false,
    how_heard VARCHAR(200),
    emergency_contact_name VARCHAR(200),
    emergency_contact_phone VARCHAR(50),
    status VARCHAR(30) DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'interview_scheduled', 'offered', 'hired', 'rejected', 'withdrawn')),
    admin_notes TEXT,
    ip_address VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_applications_listing ON public.job_applications (listing_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_email ON public.job_applications (email);
CREATE INDEX IF NOT EXISTS idx_job_applications_status ON public.job_applications (status);
CREATE INDEX IF NOT EXISTS idx_job_applications_created ON public.job_applications (created_at DESC);

-- RLS for job_applications
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "job_applications_service_all" ON public.job_applications;
CREATE POLICY "job_applications_service_all" ON public.job_applications
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- SEED: Job Listings
-- ============================================================
INSERT INTO public.job_listings (title, slug, department, employment_type, description, responsibilities, qualifications, nice_to_have, perks, pay_range, minimum_age, schedule_notes, display_order, is_active)
VALUES
  (
    'Party Host',
    'party-host',
    'Events & Parties',
    'part-time',
    'Love throwing parties? As a Party Host at Playfunia, you''ll create magical birthday celebrations that kids and parents will never forget. You''ll lead the fun, keep the energy high, and make every birthday child feel like a superstar!',
    ARRAY[
      'Lead birthday parties from setup to cleanup',
      'Set up and decorate party rooms according to package',
      'Serve food and beverages to party guests',
      'Engage kids with games, activities, and entertainment',
      'Communicate with parents about schedule and special requests',
      'Ensure party areas are clean and ready for the next group'
    ],
    ARRAY[
      'Energetic and enthusiastic personality',
      'Comfortable working with children ages 1-13',
      'Ability to multitask in a fast-paced environment',
      'Weekend availability required',
      'Must be at least 16 years old'
    ],
    ARRAY[
      'Previous experience working with children',
      'CPR/First Aid certification',
      'Experience in event planning or hospitality'
    ],
    ARRAY[
      'Fun, energetic work environment',
      'Flexible weekday scheduling',
      'Employee discounts on parties and play passes',
      'Tips from party hosts',
      'Great first job for students'
    ],
    '$15-$18/hr + tips',
    16,
    'Weekends required, flexible weekday shifts',
    1,
    true
  ),
  (
    'Front Desk Associate',
    'front-desk-associate',
    'Operations',
    'part-time',
    'Be the friendly face that welcomes every family to Playfunia! As a Front Desk Associate, you''ll help guests check in, process ticket and membership purchases, and make sure every visitor has an amazing experience from the moment they walk in.',
    ARRAY[
      'Greet families and check them in for play sessions',
      'Process ticket purchases and membership sign-ups via Square POS',
      'Answer phone calls and respond to inquiries',
      'Verify waivers and ensure all guests have completed safety forms',
      'Handle cash and card transactions accurately',
      'Maintain a clean and organized front desk area'
    ],
    ARRAY[
      'Strong customer service and communication skills',
      'Comfortable using POS systems and handling transactions',
      'Ability to multitask and stay organized',
      'Friendly and welcoming demeanor',
      'Must be at least 16 years old'
    ],
    ARRAY[
      'Experience with Square POS or similar systems',
      'Bilingual (English/Spanish or English/another language)',
      'Previous retail or customer service experience'
    ],
    ARRAY[
      'Fun, family-friendly work environment',
      'Flexible scheduling for students',
      'Employee discounts on play passes and parties',
      'Growth opportunities within the company'
    ],
    '$15-$17/hr',
    16,
    'Various shifts available, weekends preferred',
    2,
    true
  ),
  (
    'Play Zone Attendant',
    'play-zone-attendant',
    'Operations',
    'part-time',
    'Keep the fun safe and the play zones sparkling! As a Play Zone Attendant, you''ll make sure kids have a blast while staying safe. You''ll monitor play areas, enforce safety rules, and keep equipment clean and sanitized.',
    ARRAY[
      'Monitor play zones to ensure children''s safety',
      'Enforce age-appropriate zone rules and guidelines',
      'Sanitize and clean play equipment regularly',
      'Restock supplies (hand sanitizer, wipes, etc.)',
      'Assist parents and children with play zone navigation',
      'Report any maintenance or safety concerns immediately'
    ],
    ARRAY[
      'Comfortable working around children ages 1-13',
      'Detail-oriented with a focus on cleanliness',
      'Able to stand and be active for full shift',
      'Strong awareness of safety protocols',
      'Must be at least 16 years old'
    ],
    ARRAY[
      'CPR/First Aid certification',
      'Experience in childcare or recreational settings',
      'Knowledge of cleaning and sanitation best practices'
    ],
    ARRAY[
      'Active and engaging work environment',
      'Flexible scheduling',
      'Employee discounts',
      'Free play passes for family members'
    ],
    '$15-$16/hr',
    16,
    'Various shifts, weekends and evenings available',
    3,
    true
  ),
  (
    'Assistant Manager',
    'assistant-manager',
    'Management',
    'full-time',
    'Ready to take the lead? As Assistant Manager, you''ll help run the day-to-day operations at Playfunia, mentor our amazing team, and ensure every family has a top-notch experience. This is a great opportunity for someone with hospitality or retail leadership experience.',
    ARRAY[
      'Oversee daily facility operations and team performance',
      'Supervise and support Front Desk, Party Host, and Attendant staff',
      'Handle customer escalations and resolve issues professionally',
      'Manage staff scheduling, time-off requests, and coverage',
      'Conduct inventory management and supply ordering',
      'Train and onboard new team members',
      'Assist with marketing initiatives and community events',
      'Open and close the facility as needed'
    ],
    ARRAY[
      '2+ years of supervisory or management experience',
      'Background in hospitality, retail, or recreation',
      'Strong leadership and communication skills',
      'Ability to handle multiple priorities and stay calm under pressure',
      'CPR/First Aid certification within 30 days of hire',
      'Must be at least 18 years old'
    ],
    ARRAY[
      'Experience managing in a family entertainment center',
      'Familiarity with Square POS and scheduling software',
      'Event coordination experience',
      'Bilingual abilities'
    ],
    ARRAY[
      'Competitive salary with growth potential',
      'Paid time off and flexible scheduling',
      'Employee discounts on all services',
      'Leadership development opportunities',
      'Fun and rewarding work environment'
    ],
    '$22-$26/hr',
    18,
    'Full-time, must be available weekends and some evenings',
    4,
    true
  )
ON CONFLICT (slug) DO UPDATE SET
    title = EXCLUDED.title,
    department = EXCLUDED.department,
    employment_type = EXCLUDED.employment_type,
    description = EXCLUDED.description,
    responsibilities = EXCLUDED.responsibilities,
    qualifications = EXCLUDED.qualifications,
    nice_to_have = EXCLUDED.nice_to_have,
    perks = EXCLUDED.perks,
    pay_range = EXCLUDED.pay_range,
    minimum_age = EXCLUDED.minimum_age,
    schedule_notes = EXCLUDED.schedule_notes,
    display_order = EXCLUDED.display_order,
    updated_at = now();

-- ============================================================
-- DONE
-- ============================================================
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Playfunia Schema Migration Complete!';
    RAISE NOTICE 'Safe to re-run - no data loss';
    RAISE NOTICE '========================================';
END $$;
