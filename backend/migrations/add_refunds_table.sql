-- Migration: Add refunds table for Square refund processing
-- Created: 2026-02-05

-- Create refunds table for tracking refund operations
CREATE TABLE IF NOT EXISTS public.refunds (
    refund_id SERIAL PRIMARY KEY,
    square_refund_id VARCHAR(100) UNIQUE,
    square_payment_id VARCHAR(100) NOT NULL,
    order_id INTEGER REFERENCES public.orders(order_id) ON DELETE SET NULL,
    payment_id INTEGER REFERENCES public.payments(payment_id) ON DELETE SET NULL,
    booking_id INTEGER REFERENCES public.party_bookings(booking_id) ON DELETE SET NULL,
    amount_cents INTEGER NOT NULL,
    currency VARCHAR(10) DEFAULT 'USD' NOT NULL,
    status VARCHAR(30) DEFAULT 'pending' NOT NULL
      CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'rejected')),
    reason VARCHAR(500),
    initiated_by INTEGER REFERENCES public.users(user_id) ON DELETE SET NULL,
    idempotency_key VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    error_code VARCHAR(100),
    error_message TEXT
);

-- Index for looking up refunds by Square payment ID (common query)
CREATE INDEX IF NOT EXISTS idx_refunds_square_payment_id ON public.refunds(square_payment_id);

-- Index for filtering by status (for admin dashboards and reconciliation)
CREATE INDEX IF NOT EXISTS idx_refunds_status ON public.refunds(status);

-- Index for looking up refunds by order
CREATE INDEX IF NOT EXISTS idx_refunds_order_id ON public.refunds(order_id);

-- Index for looking up refunds by booking
CREATE INDEX IF NOT EXISTS idx_refunds_booking_id ON public.refunds(booking_id);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.refunds TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.refunds_refund_id_seq TO authenticated;

-- Add comment for documentation
COMMENT ON TABLE public.refunds IS 'Tracks refund operations processed through Square Refunds API';
COMMENT ON COLUMN public.refunds.square_refund_id IS 'Square refund ID returned from the Refunds API';
COMMENT ON COLUMN public.refunds.square_payment_id IS 'Square payment ID being refunded';
COMMENT ON COLUMN public.refunds.idempotency_key IS 'Deterministic key for idempotent refund requests';
COMMENT ON COLUMN public.refunds.status IS 'pending: created locally, processing: sent to Square, completed/failed/rejected: final states';
