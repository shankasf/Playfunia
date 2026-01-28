-- ============================================================
-- RECEIPTS AND PAYMENT LOGS MIGRATION
-- Run this on Supabase to add receipt tracking and payment logging
-- Safe to re-run: Uses IF NOT EXISTS
-- ============================================================

-- ============================================================
-- 1. RECEIPTS TABLE
-- Tracks all receipts for memberships, tickets, and bookings
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

COMMENT ON TABLE public.receipts IS 'Tracks all purchase receipts with verification hashes to prevent fake receipts';
COMMENT ON COLUMN public.receipts.receipt_number IS 'Format: MR-/TR-/BR-YYYYMMDDHHmm-XXXXXXXX (Membership/Ticket/Booking)';
COMMENT ON COLUMN public.receipts.verification_hash IS 'SHA-256 hash for authenticity verification';
COMMENT ON COLUMN public.receipts.metadata IS 'JSONB containing line items, plan details, etc.';

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

-- Receipts indexes
CREATE INDEX IF NOT EXISTS ix_receipts_receipt_number ON public.receipts(receipt_number);
CREATE INDEX IF NOT EXISTS ix_receipts_customer ON public.receipts(customer_id);
CREATE INDEX IF NOT EXISTS ix_receipts_purchase_type ON public.receipts(purchase_type);
CREATE INDEX IF NOT EXISTS ix_receipts_created_at ON public.receipts(created_at DESC);

-- ============================================================
-- 2. PAYMENT_LOGS TABLE
-- Comprehensive Square payment tracking for debugging and audit
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payment_logs (
    log_id SERIAL PRIMARY KEY,

    -- ========== Identifiers ==========
    idempotency_key VARCHAR(100) NOT NULL,
    payment_id VARCHAR(100),
    order_id VARCHAR(100),

    -- ========== Customer/Transaction Context ==========
    customer_id INTEGER REFERENCES public.customers(customer_id) ON DELETE SET NULL,
    user_id INTEGER REFERENCES public.users(user_id) ON DELETE SET NULL,
    booking_id INTEGER,

    -- ========== Transaction Details ==========
    provider VARCHAR(20) NOT NULL DEFAULT 'square',
    payment_type VARCHAR(30) NOT NULL,
    amount_usd NUMERIC(10,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'USD',

    -- ========== Status & Lifecycle ==========
    status VARCHAR(30) NOT NULL,
    previous_status VARCHAR(30),

    -- ========== Request Details ==========
    source_type VARCHAR(50),
    location_id VARCHAR(100),
    reference_id VARCHAR(100),

    -- ========== Response & Error Details ==========
    -- Square error structure: https://developer.squareup.com/docs/build-basics/general-considerations/handling-errors
    response_code VARCHAR(50),
    error_category VARCHAR(50),
    error_code VARCHAR(100),
    error_detail TEXT,
    error_field VARCHAR(100),

    -- ========== Square-specific details ==========
    square_receipt_number VARCHAR(100),
    square_receipt_url TEXT,
    card_brand VARCHAR(30),
    card_last4 VARCHAR(4),
    card_exp_month INTEGER,
    card_exp_year INTEGER,
    entry_method VARCHAR(50),
    cvv_status VARCHAR(30),
    avs_status VARCHAR(30),

    -- ========== Risk & Verification ==========
    risk_level VARCHAR(20),
    risk_score INTEGER,
    verification_method VARCHAR(50),

    -- ========== Timing ==========
    processing_time_ms INTEGER,

    -- ========== Full Request/Response (for debugging) ==========
    request_payload JSONB,
    response_payload JSONB,

    -- ========== Client Context ==========
    ip_address VARCHAR(64),
    user_agent TEXT,
    session_id VARCHAR(100),

    -- ========== Additional Metadata ==========
    metadata JSONB DEFAULT '{}'::jsonb,

    -- ========== Timestamps ==========
    initiated_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Documentation comments
COMMENT ON TABLE public.payment_logs IS 'Comprehensive payment logging for Square transactions - tracks all payment attempts, successes, and failures for debugging and audit';

-- Identifier columns
COMMENT ON COLUMN public.payment_logs.idempotency_key IS 'Unique key sent to Square to prevent duplicate payments';
COMMENT ON COLUMN public.payment_logs.payment_id IS 'Square payment ID returned on successful payment';
COMMENT ON COLUMN public.payment_logs.order_id IS 'Square order ID if applicable';

-- Context columns
COMMENT ON COLUMN public.payment_logs.payment_type IS 'Type: booking_deposit, ticket_purchase, membership_purchase, balance_payment';
COMMENT ON COLUMN public.payment_logs.booking_id IS 'Reference to party_bookings.booking_id for party payments';

-- Status columns
COMMENT ON COLUMN public.payment_logs.status IS 'Payment status: initiated, pending, processing, completed, failed, cancelled, refunded';
COMMENT ON COLUMN public.payment_logs.previous_status IS 'Previous status for tracking state transitions';

-- Error columns (Square error structure)
COMMENT ON COLUMN public.payment_logs.error_category IS 'Square error category: API_ERROR, AUTHENTICATION_ERROR, INVALID_REQUEST_ERROR, RATE_LIMIT_ERROR, PAYMENT_METHOD_ERROR, REFUND_ERROR';
COMMENT ON COLUMN public.payment_logs.error_code IS 'Square-specific error code: INSUFFICIENT_FUNDS, CARD_DECLINED, CVV_FAILURE, INVALID_CARD, CARD_EXPIRED, etc.';
COMMENT ON COLUMN public.payment_logs.error_detail IS 'Human-readable error description from Square';
COMMENT ON COLUMN public.payment_logs.error_field IS 'Request field that caused the error (if applicable)';

-- Card verification columns
COMMENT ON COLUMN public.payment_logs.cvv_status IS 'CVV verification result: CVV_ACCEPTED, CVV_REJECTED, CVV_NOT_CHECKED';
COMMENT ON COLUMN public.payment_logs.avs_status IS 'Address verification result: AVS_ACCEPTED, AVS_REJECTED, AVS_NOT_CHECKED';

-- Risk columns
COMMENT ON COLUMN public.payment_logs.risk_level IS 'Square risk assessment: PENDING, NORMAL, MODERATE, HIGH';

-- Payload columns
COMMENT ON COLUMN public.payment_logs.request_payload IS 'Full request sent to Square (sourceId should be masked for security)';
COMMENT ON COLUMN public.payment_logs.response_payload IS 'Full response from Square including payment details and errors';

-- Timing columns
COMMENT ON COLUMN public.payment_logs.processing_time_ms IS 'Time taken by Square to process the payment in milliseconds';
COMMENT ON COLUMN public.payment_logs.initiated_at IS 'When the payment request was initiated on our side';
COMMENT ON COLUMN public.payment_logs.completed_at IS 'When we received the response from Square';

ALTER TABLE public.payment_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on payment_logs" ON public.payment_logs;
CREATE POLICY "Service role full access on payment_logs" ON public.payment_logs
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Admin read on payment_logs" ON public.payment_logs;
CREATE POLICY "Admin read on payment_logs" ON public.payment_logs
    FOR SELECT TO authenticated USING (true);

-- Payment logs indexes for efficient querying
CREATE INDEX IF NOT EXISTS ix_payment_logs_idempotency ON public.payment_logs(idempotency_key);
CREATE INDEX IF NOT EXISTS ix_payment_logs_payment_id ON public.payment_logs(payment_id);
CREATE INDEX IF NOT EXISTS ix_payment_logs_customer ON public.payment_logs(customer_id);
CREATE INDEX IF NOT EXISTS ix_payment_logs_booking ON public.payment_logs(booking_id);
CREATE INDEX IF NOT EXISTS ix_payment_logs_status ON public.payment_logs(status);
CREATE INDEX IF NOT EXISTS ix_payment_logs_error ON public.payment_logs(error_code) WHERE error_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_payment_logs_created ON public.payment_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS ix_payment_logs_initiated ON public.payment_logs(initiated_at DESC);
CREATE INDEX IF NOT EXISTS ix_payment_logs_provider ON public.payment_logs(provider);

-- ============================================================
-- GRANTS
-- ============================================================
GRANT ALL PRIVILEGES ON public.receipts TO service_role;
GRANT ALL PRIVILEGES ON public.payment_logs TO service_role;
GRANT SELECT ON public.receipts TO authenticated;
GRANT SELECT ON public.payment_logs TO authenticated;
GRANT SELECT ON public.receipts TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.receipts_receipt_id_seq TO service_role, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.payment_logs_log_id_seq TO service_role, authenticated;

-- ============================================================
-- DONE
-- ============================================================
DO $$
BEGIN
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'Receipts & Payment Logs Migration Complete!';
    RAISE NOTICE 'Tables created: receipts, payment_logs';
    RAISE NOTICE '==========================================';
END $$;
