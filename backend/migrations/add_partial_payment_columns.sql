-- ============================================================
-- Migration: Add Partial Payment Tracking Columns
-- Run this after the base schema migration
-- ============================================================

-- Add payment option tracking to party_bookings
ALTER TABLE public.party_bookings
ADD COLUMN IF NOT EXISTS payment_option VARCHAR(20) DEFAULT 'full';

-- Add guest contact info columns (for guest bookings without customer account)
ALTER TABLE public.party_bookings
ADD COLUMN IF NOT EXISTS guest_name VARCHAR(200);

ALTER TABLE public.party_bookings
ADD COLUMN IF NOT EXISTS guest_email VARCHAR(200);

ALTER TABLE public.party_bookings
ADD COLUMN IF NOT EXISTS guest_phone VARCHAR(50);

-- Add online payment tracking
-- Note: deposit_amount already tracks online payment amount
-- balance_remaining already tracks venue payment amount
-- Adding explicit online/venue columns for clarity
ALTER TABLE public.party_bookings
ADD COLUMN IF NOT EXISTS online_payment_amount NUMERIC(10,2) DEFAULT 0;

ALTER TABLE public.party_bookings
ADD COLUMN IF NOT EXISTS venue_payment_amount NUMERIC(10,2) DEFAULT 0;

-- Add constraint for payment option values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'party_bookings_payment_option_check'
    ) THEN
        ALTER TABLE public.party_bookings
        ADD CONSTRAINT party_bookings_payment_option_check
        CHECK (payment_option IN ('full', 'split'));
    END IF;
END $$;

-- Add indexes for guest email lookup
CREATE INDEX IF NOT EXISTS ix_party_bookings_guest_email ON public.party_bookings(guest_email);
CREATE INDEX IF NOT EXISTS ix_party_bookings_payment_option ON public.party_bookings(payment_option);

-- Update existing bookings to set payment_option based on deposit_amount vs total
UPDATE public.party_bookings
SET payment_option = CASE
    WHEN deposit_amount IS NULL OR deposit_amount = 0 THEN 'full'
    WHEN deposit_amount >= total THEN 'full'
    ELSE 'split'
END,
online_payment_amount = COALESCE(deposit_amount, 0),
venue_payment_amount = COALESCE(balance_remaining, 0)
WHERE payment_option IS NULL OR online_payment_amount IS NULL OR venue_payment_amount IS NULL;

-- ============================================================
-- VERIFY
-- ============================================================
DO $$
DECLARE
    col_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO col_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'party_bookings'
    AND column_name IN ('payment_option', 'guest_name', 'guest_email', 'guest_phone', 'online_payment_amount', 'venue_payment_amount');

    RAISE NOTICE '========================================';
    RAISE NOTICE 'Partial Payment Migration Complete!';
    RAISE NOTICE 'New columns added: %', col_count;
    RAISE NOTICE '========================================';
END $$;
