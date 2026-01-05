--
-- Playfunia PostgreSQL Schema + Seed Data (Supabase-compatible)
--

SET statement_timeout = 0;

SET lock_timeout = 0;

SET idle_in_transaction_session_timeout = 0;

SET client_encoding = 'UTF8';

SET standard_conforming_strings = on;

SELECT pg_catalog.set_config ('search_path', '', false);

SET check_function_bodies = false;

SET xmloption = content;

SET client_min_messages = warning;

SET row_security = off;

SET default_tablespace = '';

--
-- Tables
--

CREATE TABLE IF NOT EXISTS public.company (
    company_id SERIAL PRIMARY KEY,
    name character varying(200) NOT NULL,
    mission text,
    values_text text,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customers (
    customer_id SERIAL PRIMARY KEY,
    full_name character varying(200) NOT NULL,
    email character varying(200),
    phone character varying(50),
    guardian_name character varying(200),
    child_name character varying(200),
    child_birthdate date,
    notes text,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.faqs (
    faq_id SERIAL PRIMARY KEY,
    question text NOT NULL,
    answer text NOT NULL,
    is_active boolean DEFAULT true,
    category character varying(100),
    display_order integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.locations (
    location_id SERIAL PRIMARY KEY,
    company_id integer,
    name character varying(200) NOT NULL,
    address text,
    city character varying(100),
    state character varying(50),
    postal_code character varying(20),
    country character varying(100) DEFAULT 'USA'::character varying,
    phone character varying(50),
    email character varying(200),
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.products (
    product_id SERIAL PRIMARY KEY,
    sku character varying(64),
    product_name character varying(255) NOT NULL,
    brand character varying(100),
    category character varying(100),
    age_group character varying(50),
    material character varying(100),
    color character varying(50),
    price_usd numeric(10,2) NOT NULL,
    stock_qty integer DEFAULT 0,
    rating numeric(3,2),
    description text,
    features text,
    country character varying(100),
    is_active boolean DEFAULT true,
    CONSTRAINT products_price_usd_check CHECK ((price_usd >= (0)::numeric)),
    CONSTRAINT products_stock_qty_check CHECK ((stock_qty >= 0))
);

CREATE TABLE IF NOT EXISTS public.ticket_types (
    ticket_type_id SERIAL PRIMARY KEY,
    name character varying(120) NOT NULL,
    description text,
    price numeric(10, 2) NOT NULL DEFAULT 0,
    base_price_usd numeric(10, 2),
    requires_waiver boolean DEFAULT true,
    requires_grip_socks boolean DEFAULT true,
    location_id integer,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.resources (
    resource_id SERIAL PRIMARY KEY,
    location_id integer NOT NULL,
    name character varying(120) NOT NULL,
    type character varying(60) DEFAULT 'PartyRoom'::character varying NOT NULL,
    capacity integer,
    is_active boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.party_packages (
    package_id SERIAL PRIMARY KEY,
    location_id integer,
    name character varying(120) NOT NULL,
    price_usd numeric(10, 2) NOT NULL,
    base_children integer DEFAULT 10 NOT NULL,
    base_room_hours numeric(4, 2) DEFAULT 2.0 NOT NULL,
    includes_food boolean DEFAULT false,
    includes_drinks boolean DEFAULT false,
    includes_decor boolean DEFAULT false,
    notes text,
    is_active boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.waivers (
    waiver_id SERIAL PRIMARY KEY,
    customer_id integer NOT NULL,
    signed_at timestamp without time zone DEFAULT now() NOT NULL,
    ip_address character varying(64),
    document_url text,
    version character varying(30) DEFAULT 'v1'::character varying,
    is_valid boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.admissions (
    admission_id SERIAL PRIMARY KEY,
    ticket_type_id integer NOT NULL,
    customer_id integer,
    location_id integer NOT NULL,
    visit_date date NOT NULL,
    price_usd numeric(10,2) NOT NULL,
    waiver_id integer,
    checked_in_at timestamp without time zone,
    status character varying(30) DEFAULT 'Issued'::character varying NOT NULL
);

CREATE TABLE IF NOT EXISTS public.inventory_movements (
    movement_id SERIAL PRIMARY KEY,
    product_id integer NOT NULL,
    quantity_change integer NOT NULL,
    reason character varying(80),
    ref_order_id integer,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orders (
    order_id SERIAL PRIMARY KEY,
    customer_id integer,
    location_id integer,
    order_type character varying(30) DEFAULT 'Retail'::character varying NOT NULL,
    status character varying(30) DEFAULT 'Pending'::character varying NOT NULL,
    subtotal_usd numeric(10,2) DEFAULT 0 NOT NULL,
    discount_usd numeric(10,2) DEFAULT 0 NOT NULL,
    tax_usd numeric(10,2) DEFAULT 0 NOT NULL,
    total_usd numeric(10,2) DEFAULT 0 NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT orders_order_type_check CHECK (((order_type)::text = ANY ((ARRAY['Retail'::character varying, 'Admission'::character varying, 'Party'::character varying, 'Mixed'::character varying])::text[]))),
    CONSTRAINT orders_status_check CHECK (((status)::text = ANY ((ARRAY['Pending'::character varying, 'Paid'::character varying, 'Cancelled'::character varying, 'Refunded'::character varying, 'PartiallyRefunded'::character varying, 'Fulfilled'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS public.party_bookings (
    booking_id SERIAL PRIMARY KEY,
    package_id integer NOT NULL,
    resource_id integer NOT NULL,
    customer_id integer NOT NULL,
    scheduled_start timestamp without time zone NOT NULL,
    scheduled_end timestamp without time zone NOT NULL,
    status character varying(30) DEFAULT 'Pending'::character varying NOT NULL,
    additional_kids integer DEFAULT 0,
    additional_guests integer DEFAULT 0,
    special_requests text,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT party_bookings_additional_guests_check CHECK ((additional_guests >= 0)),
    CONSTRAINT party_bookings_additional_kids_check CHECK ((additional_kids >= 0)),
    CONSTRAINT party_bookings_status_check CHECK (((status)::text = ANY ((ARRAY['Pending'::character varying, 'Confirmed'::character varying, 'Cancelled'::character varying, 'Completed'::character varying, 'Refunded'::character varying, 'Rescheduled'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS public.order_items (
    order_item_id SERIAL PRIMARY KEY,
    order_id integer NOT NULL,
    item_type character varying(30) NOT NULL,
    product_id integer,
    ticket_type_id integer,
    booking_id integer,
    name_override character varying(255),
    quantity integer NOT NULL,
    unit_price_usd numeric(10,2) NOT NULL,
    line_total_usd numeric(10,2) NOT NULL,
    CONSTRAINT order_items_item_type_check CHECK (((item_type)::text = ANY ((ARRAY['Product'::character varying, 'Ticket'::character varying, 'Party'::character varying])::text[]))),
    CONSTRAINT order_items_quantity_check CHECK ((quantity > 0))
);

CREATE TABLE IF NOT EXISTS public.promotions (
    promotion_id SERIAL PRIMARY KEY,
    code character varying(40) NOT NULL UNIQUE,
    description text,
    percent_off numeric(5, 2),
    amount_off_usd numeric(10, 2),
    valid_from timestamp without time zone,
    valid_to timestamp without time zone,
    max_redemptions integer,
    redemptions integer DEFAULT 0,
    is_active boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.order_promotions (
    order_id integer NOT NULL,
    promotion_id integer NOT NULL,
    PRIMARY KEY (order_id, promotion_id)
);

CREATE TABLE IF NOT EXISTS public.package_inclusions (
    inclusion_id SERIAL PRIMARY KEY,
    package_id integer NOT NULL,
    item_name character varying(150) NOT NULL,
    quantity numeric(8, 2) DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.party_addons (
    party_addon_id SERIAL PRIMARY KEY,
    booking_id integer NOT NULL,
    product_id integer,
    name character varying(150),
    quantity integer DEFAULT 1,
    unit_price_usd numeric(10, 2) DEFAULT 0 NOT NULL,
    CONSTRAINT party_addons_quantity_check CHECK ((quantity > 0))
);

CREATE TABLE IF NOT EXISTS public.party_guests (
    party_guest_id SERIAL PRIMARY KEY,
    booking_id integer NOT NULL,
    guest_name character varying(150),
    is_child boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.party_reschedules (
    reschedule_id SERIAL PRIMARY KEY,
    booking_id integer NOT NULL,
    old_start timestamp without time zone NOT NULL,
    old_end timestamp without time zone NOT NULL,
    new_start timestamp without time zone NOT NULL,
    new_end timestamp without time zone NOT NULL,
    reason text,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payments (
    payment_id SERIAL PRIMARY KEY,
    order_id integer NOT NULL,
    provider character varying(50) NOT NULL,
    provider_payment_id character varying(120),
    status character varying(30) DEFAULT 'Pending'::character varying NOT NULL,
    amount_usd numeric(10,2) NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT payments_status_check CHECK (((status)::text = ANY ((ARRAY['Pending'::character varying, 'Authorized'::character varying, 'Captured'::character varying, 'Failed'::character varying, 'Cancelled'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS public.policies (
    policy_id SERIAL PRIMARY KEY,
    key character varying(80) NOT NULL UNIQUE,
    value text,
    is_active boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.refunds (
    refund_id SERIAL PRIMARY KEY,
    payment_id integer,
    order_id integer NOT NULL,
    status character varying(30) DEFAULT 'Pending'::character varying NOT NULL,
    reason text,
    amount_usd numeric(10,2) NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT refunds_status_check CHECK (((status)::text = ANY ((ARRAY['Pending'::character varying, 'Approved'::character varying, 'Rejected'::character varying, 'Completed'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS public.staff (
    staff_id SERIAL PRIMARY KEY,
    location_id integer,
    full_name character varying(200) NOT NULL,
    role character varying(80),
    phone character varying(50),
    email character varying(200),
    is_active boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.testimonials (
    testimonial_id SERIAL PRIMARY KEY,
    name character varying(200) NOT NULL,
    quote text NOT NULL,
    rating numeric(3, 1) DEFAULT 5,
    is_featured boolean DEFAULT false,
    relationship character varying(100),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

--
-- Seed Data
--

-- company
INSERT INTO
    public.company (
        company_id,
        name,
        mission,
        values_text,
        created_at
    )
VALUES (
        1,
        'Playfunia',
        'FUN & ACTIVE PLAY. SAFE & CLEAN SPACE. BIRTHDAY PARTIES.',
        'Movement, laughter, imagination; stress-free parties; cleanliness & safety.',
        '2025-11-02 05:19:15.274992'
    ) ON CONFLICT DO NOTHING;

-- customers
INSERT INTO
    public.customers (
        customer_id,
        full_name,
        email,
        phone,
        guardian_name,
        child_name,
        child_birthdate,
        notes,
        created_at
    )
VALUES (
        1,
        'Meena Patel',
        'meena.patel@gmail.com',
        '845-321-1001',
        'Meena Patel',
        'Aarav Patel',
        '2017-06-15',
        'Loves trampoline',
        '2025-11-02 05:46:32.340483'
    ),
    (
        2,
        'Adam Williams',
        'adam.w@gmail.com',
        '845-321-1002',
        'Adam Williams',
        'Sophie Williams',
        '2019-02-11',
        'Prefers slide zone',
        '2025-11-02 05:46:32.340483'
    ),
    (
        3,
        'Riya Sharma',
        'riya.s@gmail.com',
        '845-321-1003',
        'Riya Sharma',
        'Ishaan Sharma',
        '2020-08-25',
        'Allergic to peanuts',
        '2025-11-02 05:46:32.340483'
    ),
    (
        4,
        'Carlos Diaz',
        'carlos.d@gmail.com',
        '845-321-1004',
        'Carlos Diaz',
        'Lucas Diaz',
        '2016-12-09',
        'Frequent visitor',
        '2025-11-02 05:46:32.340483'
    ),
    (
        5,
        'Emily Green',
        'emily.g@gmail.com',
        '845-321-1005',
        'Emily Green',
        'Ella Green',
        '2018-11-02',
        'Interested in membership',
        '2025-11-02 05:46:32.340483'
    ),
    (
        6,
        'Rahul Sanodia',
        'rahul@gmail.com',
        '6743567908',
        'Rahul Sanodia',
        'kabir sanodia',
        '2020-12-01',
        'keep chicken pizza',
        '2025-11-02 07:04:14.558121'
    ),
    (
        7,
        'Ali Khan',
        'ali@gmail.com',
        '123456789',
        'Ali Khan',
        'Saad, Meher, Mohsin, Zubair',
        '2020-12-12',
        'Booking party for 4 kids on Nov 8, 4 pm. Saad is birthday child.',
        '2025-11-07 16:13:34.500664'
    ),
    (
        8,
        'May',
        'may@gmail.com',
        '9834567901',
        'May',
        'Maykid',
        '2020-01-10',
        'Needs pizza and coke at the party.',
        '2025-11-14 15:51:22.642093'
    ),
    (
        9,
        'Frank',
        'frank@gmail.com',
        '123478345',
        'Frank parent',
        'Kim',
        '2020-12-03',
        NULL,
        '2025-11-21 16:55:32.13302'
    ),
    (
        10,
        'haripriya',
        'hpriya@gmail.com',
        '845774857',
        'haripriya',
        'Hkid',
        '2020-01-22',
        NULL,
        '2025-11-24 15:36:30.243906'
    ),
    (
        11,
        'Cannor',
        'connor@gmail.com',
        '5467895323',
        'same',
        'kid connor',
        '2021-11-21',
        'We will bring our own pizzas.',
        '2025-11-26 12:16:32.661714'
    ),
    (
        12,
        'Amisha Mehta',
        'amisha@gmail.com',
        '45384785738',
        'Amisha Mehta',
        'kid123',
        '2022-11-30',
        'Will bring own cold drink',
        '2025-11-26 17:38:54.871021'
    ),
    (
        13,
        'sumanth',
        NULL,
        '4563458798',
        'sumanth',
        'sumanthKidA',
        '2019-11-20',
        'We will bring our own food items.',
        '2025-11-27 17:16:37.702979'
    ) ON CONFLICT DO NOTHING;

-- faqs
INSERT INTO
    public.faqs (
        faq_id,
        question,
        answer,
        is_active
    )
VALUES (
        1,
        'Do parents need socks?',
        'Yes, everyone must wear grip socks.',
        true
    ),
    (
        2,
        'Can we bring our own cake?',
        'Yes, for private party bookings.',
        true
    ),
    (
        3,
        'Is food included?',
        'Yes, for Super Fun and Mega Fun packages.',
        true
    ),
    (
        4,
        'Do you sanitize daily?',
        'Yes, after each play session.',
        true
    ),
    (
        5,
        'Can adults play too?',
        'Adults can join toddlers but must follow safety rules.',
        true
    ) ON CONFLICT DO NOTHING;

-- locations
INSERT INTO
    public.locations (
        location_id,
        company_id,
        name,
        address,
        city,
        state,
        postal_code,
        country,
        phone,
        email,
        is_active
    )
VALUES (
        1,
        1,
        'Poughkeepsie Galleria Mall',
        '2001 South Rd Unit A108',
        'Poughkeepsie',
        'NY',
        '12601',
        'USA',
        '845-632-2185',
        'info@playfunia.com',
        true
    ),
    (
        2,
        1,
        'Deptford Mall',
        '2000 Deptford Center Rd',
        'Deptford',
        'NJ',
        '08096',
        'USA',
        '856-555-4FUN',
        'deptford@playfunia.com',
        true
    ) ON CONFLICT DO NOTHING;

-- products
INSERT INTO
    public.products (
        product_id,
        sku,
        product_name,
        brand,
        category,
        age_group,
        material,
        color,
        price_usd,
        stock_qty,
        rating,
        description,
        features,
        country,
        is_active
    )
VALUES (
        1,
        'PF-TBALL',
        'Toy Ball',
        'Playfunia',
        'Toys',
        '1-5',
        'Rubber',
        'Multicolor',
        9.99,
        150,
        4.60,
        'Soft play ball',
        'Safe & bouncy',
        'China',
        true
    ),
    (
        2,
        'PF-GSOCK',
        'Grip Socks',
        'Playfunia',
        'Accessories',
        'All',
        'Cotton',
        'Blue',
        3.00,
        300,
        4.80,
        'Required for entry',
        'Anti-slip',
        'India',
        true
    ),
    (
        3,
        'PF-TSHIRT',
        'Kids T-Shirt',
        'Playfunia',
        'Merch',
        '3-10',
        'Cotton',
        'Yellow',
        15.00,
        120,
        4.50,
        'Logo printed tee',
        'Soft fabric',
        'Bangladesh',
        true
    ),
    (
        4,
        'PF-CAP',
        'Fun Cap',
        'Playfunia',
        'Merch',
        '5-13',
        'Polyester',
        'Red',
        12.00,
        75,
        4.40,
        'Sun cap with logo',
        'Adjustable strap',
        'Vietnam',
        true
    ),
    (
        5,
        'PF-BOTTLE',
        'Water Bottle',
        'Playfunia',
        'Merch',
        'All',
        'Plastic',
        'Green',
        6.50,
        200,
        4.70,
        'BPA free bottle',
        'Durable & lightweight',
        'USA',
        true
    ) ON CONFLICT DO NOTHING;

-- ticket_types
INSERT INTO
    public.ticket_types (
        ticket_type_id,
        name,
        description,
        base_price_usd,
        requires_waiver,
        requires_grip_socks,
        location_id,
        is_active
    )
VALUES (
        1,
        'General Admission (1 Kid + 1 Adult)',
        'All-day play access',
        20.00,
        true,
        true,
        NULL,
        true
    ),
    (
        2,
        'Sibling Bundle (2 Kids + 2 Adults)',
        'Save $5 with 2 kids!',
        35.00,
        true,
        true,
        NULL,
        true
    ),
    (
        3,
        'Sibling Bundle (3 Kids + 3 Adults)',
        'Save $10 with 3 kids!',
        50.00,
        true,
        true,
        NULL,
        true
    ),
    (
        4,
        'Sibling Bundle (4 Kids + 4 Adults)',
        'Save $15 with 4 kids!',
        65.00,
        true,
        true,
        NULL,
        true
    ),
    (
        5,
        'Sibling Bundle (5 Kids + 5 Adults)',
        'Save $20 with 5 kids!',
        80.00,
        true,
        true,
        NULL,
        true
    ),
    (
        6,
        'Sibling Bundle (6 Kids + 6 Adults)',
        'Save $25 with 6 kids!',
        95.00,
        true,
        true,
        NULL,
        true
    ),
    (
        7,
        'Additional Guest',
        'Extra adult or child add-on',
        5.00,
        true,
        true,
        NULL,
        true
    ),
    (
        8,
        'General Admission',
        '1 Kid + 1 Adult',
        20.00,
        true,
        true,
        1,
        true
    ),
    (
        9,
        'Sibling Bundle (2 Kids)',
        '2 Kids + 2 Adults - Save $5!',
        35.00,
        true,
        true,
        1,
        true
    ),
    (
        10,
        'Sibling Bundle (3 Kids)',
        '3 Kids + 3 Adults - Save $10!',
        50.00,
        true,
        true,
        1,
        true
    ),
    (
        11,
        'Sibling Bundle (4 Kids)',
        '4 Kids + 4 Adults - Save $15!',
        65.00,
        true,
        true,
        1,
        true
    ),
    (
        12,
        'Sibling Bundle (5 Kids)',
        '5 Kids + 5 Adults - Save $20!',
        80.00,
        true,
        true,
        1,
        true
    ),
    (
        13,
        'Sibling Bundle (6 Kids)',
        '6 Kids + 6 Adults - Save $25!',
        95.00,
        true,
        true,
        1,
        true
    ),
    (
        14,
        'Additional Guest',
        'Extra adult or child',
        5.00,
        true,
        true,
        1,
        true
    ),
    (
        15,
        'Grip Socks',
        'Required for play',
        3.00,
        false,
        true,
        1,
        true
    ),
    (
        16,
        'Party Add-On Entry',
        'Add guest to booked party',
        10.00,
        true,
        true,
        1,
        true
    ) ON CONFLICT DO NOTHING;

-- resources
INSERT INTO
    public.resources (
        resource_id,
        location_id,
        name,
        type,
        capacity,
        is_active
    )
VALUES (
        1,
        1,
        'Party Room A',
        'PartyRoom',
        20,
        true
    ),
    (
        2,
        1,
        'Party Room B',
        'PartyRoom',
        25,
        true
    ),
    (
        3,
        1,
        'Trampoline Zone',
        'PlayArea',
        30,
        true
    ),
    (
        4,
        1,
        'Ball Pool',
        'PlayArea',
        40,
        true
    ),
    (
        5,
        1,
        'Toddler Zone',
        'PlayArea',
        15,
        true
    ) ON CONFLICT DO NOTHING;

-- party_packages
INSERT INTO
    public.party_packages (
        package_id,
        location_id,
        name,
        price_usd,
        base_children,
        base_room_hours,
        includes_food,
        includes_drinks,
        includes_decor,
        notes,
        is_active
    )
VALUES (
        1,
        1,
        'MINI FUN',
        399.00,
        10,
        2.00,
        false,
        false,
        false,
        'Bring your own snacks/treats; guests handle decorations & food',
        true
    ),
    (
        2,
        1,
        'SUPER FUN',
        599.00,
        10,
        2.00,
        true,
        true,
        false,
        'Pizza (1 slice/child) + drinks; snack tray included',
        true
    ),
    (
        3,
        1,
        'MEGA FUN',
        699.00,
        10,
        2.00,
        true,
        true,
        true,
        'Custom themed balloon decor; themed tableware + extras',
        true
    ),
    (
        4,
        1,
        'MINI FUN',
        399.00,
        10,
        2.00,
        false,
        false,
        false,
        'Bring your own snacks & decorations',
        true
    ),
    (
        5,
        1,
        'SUPER FUN',
        599.00,
        10,
        2.00,
        true,
        true,
        false,
        'Pizza & drinks included',
        true
    ),
    (
        6,
        1,
        'MEGA FUN',
        699.00,
        10,
        2.00,
        true,
        true,
        true,
        'Includes balloon décor & themed setup',
        true
    ),
    (
        7,
        1,
        'ULTRA FUN',
        799.00,
        12,
        2.50,
        true,
        true,
        true,
        'Extended playtime & cake included',
        true
    ),
    (
        8,
        1,
        'DELUXE FUN',
        899.00,
        15,
        3.00,
        true,
        true,
        true,
        'VIP theme décor + party host',
        true
    ) ON CONFLICT DO NOTHING;

-- waivers
INSERT INTO
    public.waivers (
        waiver_id,
        customer_id,
        signed_at,
        ip_address,
        document_url,
        version,
        is_valid
    )
VALUES (
        1,
        1,
        '2025-11-02 05:46:32.340483',
        '192.168.1.10',
        'https://docs.playfunia.com/waiver1.pdf',
        'v1',
        true
    ),
    (
        2,
        2,
        '2025-11-02 05:46:32.340483',
        '192.168.1.11',
        'https://docs.playfunia.com/waiver2.pdf',
        'v1',
        true
    ),
    (
        3,
        3,
        '2025-11-02 05:46:32.340483',
        '192.168.1.12',
        'https://docs.playfunia.com/waiver3.pdf',
        'v1',
        true
    ),
    (
        4,
        4,
        '2025-11-02 05:46:32.340483',
        '192.168.1.13',
        'https://docs.playfunia.com/waiver4.pdf',
        'v1',
        true
    ),
    (
        5,
        5,
        '2025-11-02 05:46:32.340483',
        '192.168.1.14',
        'https://docs.playfunia.com/waiver5.pdf',
        'v1',
        true
    ) ON CONFLICT DO NOTHING;

-- orders
INSERT INTO
    public.orders (
        order_id,
        customer_id,
        location_id,
        order_type,
        status,
        subtotal_usd,
        discount_usd,
        tax_usd,
        total_usd,
        notes,
        created_at,
        updated_at
    )
VALUES (
        1,
        1,
        1,
        'Retail',
        'Paid',
        24.00,
        0.00,
        2.40,
        26.40,
        NULL,
        '2025-11-02 05:46:32.340483',
        '2025-11-02 05:46:32.340483'
    ),
    (
        2,
        2,
        1,
        'Admission',
        'Paid',
        20.00,
        0.00,
        2.00,
        22.00,
        NULL,
        '2025-11-02 05:46:32.340483',
        '2025-11-02 05:46:32.340483'
    ),
    (
        3,
        3,
        1,
        'Party',
        'Pending',
        699.00,
        0.00,
        69.90,
        768.90,
        NULL,
        '2025-11-02 05:46:32.340483',
        '2025-11-02 05:46:32.340483'
    ),
    (
        4,
        4,
        1,
        'Retail',
        'Paid',
        30.00,
        0.00,
        3.00,
        33.00,
        NULL,
        '2025-11-02 05:46:32.340483',
        '2025-11-02 05:46:32.340483'
    ),
    (
        5,
        5,
        1,
        'Mixed',
        'Paid',
        50.00,
        0.00,
        5.00,
        55.00,
        NULL,
        '2025-11-02 05:46:32.340483',
        '2025-11-02 05:46:32.340483'
    ),
    (
        7,
        6,
        NULL,
        'Retail',
        'Pending',
        9.99,
        0.00,
        0.00,
        9.99,
        'Order for Toy Ball for Mini Fun party guest.',
        '2025-11-02 07:11:53.021523',
        '2025-11-02 07:11:53.021523'
    ) ON CONFLICT DO NOTHING;

-- party_bookings
INSERT INTO
    public.party_bookings (
        booking_id,
        package_id,
        resource_id,
        customer_id,
        scheduled_start,
        scheduled_end,
        status,
        additional_kids,
        additional_guests,
        special_requests,
        created_at
    )
VALUES (
        1,
        1,
        1,
        1,
        '2025-12-10 12:00:00',
        '2025-12-10 14:00:00',
        'Confirmed',
        0,
        0,
        NULL,
        '2025-11-02 05:46:32.340483'
    ),
    (
        2,
        2,
        2,
        2,
        '2025-12-15 13:00:00',
        '2025-12-15 15:00:00',
        'Pending',
        0,
        0,
        NULL,
        '2025-11-02 05:46:32.340483'
    ),
    (
        3,
        3,
        3,
        3,
        '2025-12-18 11:00:00',
        '2025-12-18 13:00:00',
        'Confirmed',
        0,
        0,
        NULL,
        '2025-11-02 05:46:32.340483'
    ),
    (
        4,
        4,
        4,
        4,
        '2025-12-20 10:00:00',
        '2025-12-20 12:30:00',
        'Completed',
        0,
        0,
        NULL,
        '2025-11-02 05:46:32.340483'
    ),
    (
        5,
        5,
        5,
        5,
        '2025-12-22 15:00:00',
        '2025-12-22 17:00:00',
        'Pending',
        0,
        0,
        NULL,
        '2025-11-02 05:46:32.340483'
    ),
    (
        6,
        1,
        1,
        1,
        '2024-11-06 15:00:00',
        '2024-11-06 17:00:00',
        'Pending',
        0,
        0,
        NULL,
        '2025-11-02 06:10:01.40459'
    ),
    (
        8,
        1,
        1,
        6,
        '2024-11-06 11:00:00',
        '2024-11-06 13:00:00',
        'Pending',
        0,
        0,
        'keep chicken pizza',
        '2025-11-02 07:05:34.323644'
    ),
    (
        9,
        1,
        1,
        7,
        '2024-11-08 12:00:00',
        '2024-11-08 14:00:00',
        'Pending',
        0,
        0,
        'Booking for Saad''s birthday, total 5 guests.',
        '2025-11-07 16:15:33.996718'
    ),
    (
        10,
        1,
        1,
        8,
        '2025-11-20 15:00:00',
        '2025-11-20 17:00:00',
        'Pending',
        0,
        0,
        'Needs pizza and coke at the party.',
        '2025-11-14 15:55:27.94166'
    ),
    (
        11,
        1,
        1,
        9,
        '2025-11-24 12:00:00',
        '2025-11-24 14:00:00',
        'Pending',
        0,
        0,
        NULL,
        '2025-11-21 16:56:03.821951'
    ),
    (
        12,
        1,
        1,
        10,
        '2024-11-27 18:00:00',
        '2024-11-27 20:00:00',
        'Pending',
        0,
        0,
        NULL,
        '2025-11-24 15:36:38.123497'
    ),
    (
        13,
        1,
        1,
        11,
        '2025-11-28 15:00:00',
        '2025-11-28 17:00:00',
        'Pending',
        0,
        0,
        'We will bring our own pizzas.',
        '2025-11-26 12:17:20.29515'
    ),
    (
        15,
        1,
        1,
        13,
        '2026-01-20 18:00:00',
        '2026-01-20 20:00:00',
        'Pending',
        0,
        0,
        'We will bring our own food items.',
        '2025-11-27 17:19:09.494649'
    ) ON CONFLICT DO NOTHING;

-- order_items
INSERT INTO
    public.order_items (
        order_item_id,
        order_id,
        item_type,
        product_id,
        ticket_type_id,
        booking_id,
        name_override,
        quantity,
        unit_price_usd,
        line_total_usd
    )
VALUES (
        1,
        1,
        'Product',
        1,
        NULL,
        NULL,
        NULL,
        2,
        9.99,
        19.98
    ),
    (
        2,
        2,
        'Ticket',
        1,
        NULL,
        NULL,
        NULL,
        1,
        20.00,
        20.00
    ),
    (
        3,
        3,
        'Party',
        1,
        NULL,
        NULL,
        NULL,
        1,
        699.00,
        699.00
    ),
    (
        4,
        4,
        'Product',
        2,
        NULL,
        NULL,
        NULL,
        10,
        3.00,
        30.00
    ),
    (
        5,
        5,
        'Product',
        3,
        NULL,
        NULL,
        NULL,
        2,
        15.00,
        30.00
    ),
    (
        7,
        7,
        'Product',
        1,
        NULL,
        NULL,
        NULL,
        1,
        9.99,
        9.99
    ) ON CONFLICT DO NOTHING;

-- payments
INSERT INTO
    public.payments (
        payment_id,
        order_id,
        provider,
        provider_payment_id,
        status,
        amount_usd,
        created_at
    )
VALUES (
        1,
        1,
        'Square',
        'sq_001',
        'Captured',
        26.40,
        '2025-11-02 05:46:32.340483'
    ),
    (
        2,
        2,
        'Square',
        'sq_002',
        'Captured',
        22.00,
        '2025-11-02 05:46:32.340483'
    ),
    (
        3,
        3,
        'Square',
        'sq_003',
        'Pending',
        768.90,
        '2025-11-02 05:46:32.340483'
    ),
    (
        4,
        4,
        'Stripe',
        'st_004',
        'Captured',
        33.00,
        '2025-11-02 05:46:32.340483'
    ),
    (
        5,
        5,
        'Cash',
        'cs_005',
        'Captured',
        55.00,
        '2025-11-02 05:46:32.340483'
    ),
    (
        6,
        7,
        'Card',
        NULL,
        'Captured',
        9.99,
        '2025-11-02 07:12:47.753123'
    ) ON CONFLICT DO NOTHING;

-- policies
INSERT INTO
    public.policies (
        policy_id,
        key,
        value,
        is_active
    )
VALUES (
        1,
        'grip_socks_required',
        'Grip socks must be worn at all times.',
        true
    ),
    (
        2,
        'no_confetti',
        'Confetti or glitter not allowed.',
        true
    ),
    (
        3,
        'reschedule_48hrs',
        'Parties must be rescheduled at least 48 hours in advance.',
        true
    ),
    (
        4,
        'outside_food_allowed',
        'Only MINI FUN package allows outside food.',
        true
    ),
    (
        5,
        'safety_first',
        'Staff may restrict unsafe play.',
        true
    ) ON CONFLICT DO NOTHING;

-- refunds
INSERT INTO
    public.refunds (
        refund_id,
        payment_id,
        order_id,
        status,
        reason,
        amount_usd,
        created_at
    )
VALUES (
        1,
        NULL,
        1,
        'Completed',
        'Partial refund for damaged product',
        9.99,
        '2025-11-02 05:46:32.340483'
    ),
    (
        2,
        NULL,
        2,
        'Rejected',
        'Non-refundable ticket',
        0.00,
        '2025-11-02 05:46:32.340483'
    ),
    (
        3,
        NULL,
        3,
        'Pending',
        'Deposit refund',
        50.00,
        '2025-11-02 05:46:32.340483'
    ),
    (
        4,
        NULL,
        4,
        'Completed',
        'Overcharge correction',
        3.00,
        '2025-11-02 05:46:32.340483'
    ),
    (
        5,
        NULL,
        5,
        'Pending',
        'No refund issued yet',
        0.00,
        '2025-11-02 05:46:32.340483'
    ) ON CONFLICT DO NOTHING;

-- staff
INSERT INTO
    public.staff (
        staff_id,
        location_id,
        full_name,
        role,
        phone,
        email,
        is_active
    )
VALUES (
        6,
        1,
        'Sarah Lopez',
        'Manager',
        '845-200-5001',
        'sarah@playfunia.com',
        true
    ),
    (
        7,
        1,
        'Jake Turner',
        'Party Host',
        '845-200-5002',
        'jake@playfunia.com',
        true
    ),
    (
        8,
        1,
        'Lily Morgan',
        'Front Desk',
        '845-200-5003',
        'lily@playfunia.com',
        true
    ),
    (
        9,
        1,
        'Raj Patel',
        'Cleaner',
        '845-200-5004',
        'raj@playfunia.com',
        true
    ),
    (
        10,
        1,
        'Tina Brown',
        'Event Planner',
        '845-200-5005',
        'tina@playfunia.com',
        true
    ) ON CONFLICT DO NOTHING;

-- testimonials
INSERT INTO
    public.testimonials (
        testimonial_id,
        customer_name,
        quote,
        rating,
        is_featured,
        created_at
    )
VALUES (
        1,
        'Meena P.',
        'Safe, clean, and so fun for kids!',
        5.00,
        false,
        '2025-11-02 05:46:32.340483'
    ),
    (
        2,
        'Adam W.',
        'Our birthday party was stress-free.',
        4.80,
        false,
        '2025-11-02 05:46:32.340483'
    ),
    (
        3,
        'Riya S.',
        'My son loves the slides and ball pit.',
        4.90,
        false,
        '2025-11-02 05:46:32.340483'
    ),
    (
        4,
        'Carlos D.',
        'The staff is super friendly!',
        4.70,
        false,
        '2025-11-02 05:46:32.340483'
    ),
    (
        5,
        'Emily G.',
        'Very organized and worth every penny.',
        5.00,
        false,
        '2025-11-02 05:46:32.340483'
    ) ON CONFLICT DO NOTHING;

--
-- Reset sequences to current max values
--

SELECT setval (
        'public.company_company_id_seq', (
            SELECT COALESCE(MAX(company_id), 0)
            FROM public.company
        ) + 1, false
    );

SELECT setval (
        'public.customers_customer_id_seq', (
            SELECT COALESCE(MAX(customer_id), 0)
            FROM public.customers
        ) + 1, false
    );

SELECT setval (
        'public.faqs_faq_id_seq', (
            SELECT COALESCE(MAX(faq_id), 0)
            FROM public.faqs
        ) + 1, false
    );

SELECT setval (
        'public.locations_location_id_seq', (
            SELECT COALESCE(MAX(location_id), 0)
            FROM public.locations
        ) + 1, false
    );

SELECT setval (
        'public.products_product_id_seq', (
            SELECT COALESCE(MAX(product_id), 0)
            FROM public.products
        ) + 1, false
    );

SELECT setval (
        'public.ticket_types_ticket_type_id_seq', (
            SELECT COALESCE(MAX(ticket_type_id), 0)
            FROM public.ticket_types
        ) + 1, false
    );

SELECT setval (
        'public.resources_resource_id_seq', (
            SELECT COALESCE(MAX(resource_id), 0)
            FROM public.resources
        ) + 1, false
    );

SELECT setval (
        'public.party_packages_package_id_seq', (
            SELECT COALESCE(MAX(package_id), 0)
            FROM public.party_packages
        ) + 1, false
    );

SELECT setval (
        'public.waivers_waiver_id_seq', (
            SELECT COALESCE(MAX(waiver_id), 0)
            FROM public.waivers
        ) + 1, false
    );

SELECT setval (
        'public.orders_order_id_seq', (
            SELECT COALESCE(MAX(order_id), 0)
            FROM public.orders
        ) + 1, false
    );

SELECT setval (
        'public.party_bookings_booking_id_seq', (
            SELECT COALESCE(MAX(booking_id), 0)
            FROM public.party_bookings
        ) + 1, false
    );

SELECT setval (
        'public.order_items_order_item_id_seq', (
            SELECT COALESCE(MAX(order_item_id), 0)
            FROM public.order_items
        ) + 1, false
    );

SELECT setval (
        'public.payments_payment_id_seq', (
            SELECT COALESCE(MAX(payment_id), 0)
            FROM public.payments
        ) + 1, false
    );

SELECT setval (
        'public.policies_policy_id_seq', (
            SELECT COALESCE(MAX(policy_id), 0)
            FROM public.policies
        ) + 1, false
    );

SELECT setval (
        'public.refunds_refund_id_seq', (
            SELECT COALESCE(MAX(refund_id), 0)
            FROM public.refunds
        ) + 1, false
    );

SELECT setval (
        'public.staff_staff_id_seq', (
            SELECT COALESCE(MAX(staff_id), 0)
            FROM public.staff
        ) + 1, false
    );

SELECT setval (
        'public.testimonials_testimonial_id_seq', (
            SELECT COALESCE(MAX(testimonial_id), 0)
            FROM public.testimonials
        ) + 1, false
    );

--
-- Foreign Keys
--

ALTER TABLE public.locations
ADD CONSTRAINT locations_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company (company_id) ON DELETE CASCADE;

ALTER TABLE public.ticket_types
ADD CONSTRAINT ticket_types_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations (location_id) ON DELETE SET NULL;

ALTER TABLE public.resources
ADD CONSTRAINT resources_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations (location_id) ON DELETE CASCADE;

ALTER TABLE public.party_packages
ADD CONSTRAINT party_packages_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations (location_id) ON DELETE SET NULL;

ALTER TABLE public.waivers
ADD CONSTRAINT waivers_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers (customer_id) ON DELETE CASCADE;

ALTER TABLE public.admissions
ADD CONSTRAINT admissions_ticket_type_id_fkey FOREIGN KEY (ticket_type_id) REFERENCES public.ticket_types (ticket_type_id) ON DELETE RESTRICT;

ALTER TABLE public.admissions
ADD CONSTRAINT admissions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers (customer_id) ON DELETE SET NULL;

ALTER TABLE public.admissions
ADD CONSTRAINT admissions_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations (location_id) ON DELETE RESTRICT;

ALTER TABLE public.admissions
ADD CONSTRAINT admissions_waiver_id_fkey FOREIGN KEY (waiver_id) REFERENCES public.waivers (waiver_id) ON DELETE SET NULL;

ALTER TABLE public.inventory_movements
ADD CONSTRAINT inventory_movements_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products (product_id) ON DELETE CASCADE;

ALTER TABLE public.orders
ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers (customer_id) ON DELETE SET NULL;

ALTER TABLE public.orders
ADD CONSTRAINT orders_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations (location_id) ON DELETE SET NULL;

ALTER TABLE public.party_bookings
ADD CONSTRAINT party_bookings_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.party_packages (package_id) ON DELETE RESTRICT;

ALTER TABLE public.party_bookings
ADD CONSTRAINT party_bookings_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resources (resource_id) ON DELETE RESTRICT;

ALTER TABLE public.party_bookings
ADD CONSTRAINT party_bookings_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers (customer_id) ON DELETE RESTRICT;

ALTER TABLE public.order_items
ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders (order_id) ON DELETE CASCADE;

ALTER TABLE public.order_items
ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products (product_id) ON DELETE SET NULL;

ALTER TABLE public.order_items
ADD CONSTRAINT order_items_ticket_type_id_fkey FOREIGN KEY (ticket_type_id) REFERENCES public.ticket_types (ticket_type_id) ON DELETE SET NULL;

ALTER TABLE public.order_items
ADD CONSTRAINT order_items_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.party_bookings (booking_id) ON DELETE SET NULL;

ALTER TABLE public.order_promotions
ADD CONSTRAINT order_promotions_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders (order_id) ON DELETE CASCADE;

ALTER TABLE public.order_promotions
ADD CONSTRAINT order_promotions_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES public.promotions (promotion_id) ON DELETE RESTRICT;

ALTER TABLE public.package_inclusions
ADD CONSTRAINT package_inclusions_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.party_packages (package_id) ON DELETE CASCADE;

ALTER TABLE public.party_addons
ADD CONSTRAINT party_addons_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.party_bookings (booking_id) ON DELETE CASCADE;

ALTER TABLE public.party_addons
ADD CONSTRAINT party_addons_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products (product_id) ON DELETE SET NULL;

ALTER TABLE public.party_guests
ADD CONSTRAINT party_guests_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.party_bookings (booking_id) ON DELETE CASCADE;

ALTER TABLE public.party_reschedules
ADD CONSTRAINT party_reschedules_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.party_bookings (booking_id) ON DELETE CASCADE;

ALTER TABLE public.payments
ADD CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders (order_id) ON DELETE CASCADE;

ALTER TABLE public.refunds
ADD CONSTRAINT refunds_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments (payment_id) ON DELETE SET NULL;

ALTER TABLE public.refunds
ADD CONSTRAINT refunds_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders (order_id) ON DELETE CASCADE;

ALTER TABLE public.staff
ADD CONSTRAINT staff_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations (location_id) ON DELETE SET NULL;

--
-- Indexes
--

CREATE INDEX IF NOT EXISTS ix_admissions_visit ON public.admissions USING btree (location_id, visit_date);

CREATE INDEX IF NOT EXISTS ix_inventory_movements_product ON public.inventory_movements USING btree (product_id);

CREATE INDEX IF NOT EXISTS ix_order_items_order ON public.order_items USING btree (order_id);

CREATE INDEX IF NOT EXISTS ix_party_bookings_resource_time ON public.party_bookings USING btree (
    resource_id,
    scheduled_start,
    scheduled_end
);

CREATE INDEX IF NOT EXISTS ix_payments_order ON public.payments USING btree (order_id);

CREATE INDEX IF NOT EXISTS ix_waivers_customer ON public.waivers USING btree (customer_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_locations_company_name ON public.locations USING btree (company_id, name);

-- Done