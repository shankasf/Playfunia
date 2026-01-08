-- Migration: Add is_guest column to customers table
-- Run this on existing databases to support guest checkout with real customer records

-- Add is_guest column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'customers'
        AND column_name = 'is_guest'
    ) THEN
        ALTER TABLE public.customers ADD COLUMN is_guest BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Create index for faster guest lookups
CREATE INDEX IF NOT EXISTS idx_customers_is_guest ON public.customers(is_guest) WHERE is_guest = true;

-- Create index for email lookups (for findOrCreateGuest)
CREATE INDEX IF NOT EXISTS idx_customers_email ON public.customers(email);
