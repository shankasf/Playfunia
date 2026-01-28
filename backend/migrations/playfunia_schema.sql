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
-- 3. CUSTOMERS
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
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

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
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

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
    package_id INTEGER REFERENCES public.party_packages(package_id) ON DELETE SET NULL,
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
-- INDEXES (using IF NOT EXISTS)
-- ============================================================
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
    ('Sibling Bundle (4 Kids)', 'Bundle for 4 kids', 65.00, 4, true, true),
    ('Sibling Bundle (5 Kids)', 'Bundle for 5 kids', 80.00, 5, true, true),
    ('Sibling Bundle (6 Kids)', 'Bundle for 6 kids', 95.00, 6, true, true),
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
    ('face_painting', 'Face Painting', 'Professional face painting for all guests', 100.00, 'flat', 3),
    ('photo_video', 'Photo & Video', 'Professional photography and videography', 250.00, 'flat', 4),
    ('balloon_artist', 'Balloon Artist', 'Balloon sculptures for all guests', 150.00, 'flat', 5),
    ('character_visit', 'Character Visit', 'Special character appearance at your party', 200.00, 'flat', 6)
ON CONFLICT (code) DO NOTHING;

-- Pricing config
INSERT INTO public.pricing_config (config_key, config_value, description)
VALUES
    ('cleaning_fee', 50.00, 'Standard cleaning fee for party bookings'),
    ('grip_socks_price', 3.00, 'Price per pair of grip socks'),
    ('extra_child_admission', 15.00, 'Price per additional child beyond trio bundle'),
    ('deposit_percentage', 50.00, 'Deposit percentage for party bookings'),
    ('sibling_discount_rate', 5.00, 'Discount percentage for sibling bookings')
ON CONFLICT (config_key) DO NOTHING;

-- Location
INSERT INTO public.locations (name, address, city, state, postal_code, phone, email)
VALUES ('Albany', '1 Crossgates Mall Rd, Unit N202, Level 2, Near Macy''s', 'Albany', 'NY', '12203', '+1 (201) 539-5928', 'info@playfunia.com')
ON CONFLICT DO NOTHING;

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
-- DONE
-- ============================================================
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Playfunia Schema Migration Complete!';
    RAISE NOTICE 'Safe to re-run - no data loss';
    RAISE NOTICE '========================================';
END $$;
