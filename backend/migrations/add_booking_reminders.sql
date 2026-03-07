-- ============================================================
-- BOOKING REMINDERS TABLE
-- Tracks reminder emails sent for upcoming party bookings.
-- Follows the same pattern as membership_reminders.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.booking_reminders (
    reminder_id SERIAL PRIMARY KEY,
    booking_id INTEGER NOT NULL REFERENCES public.party_bookings(booking_id) ON DELETE CASCADE,
    reminder_type VARCHAR(20) NOT NULL,  -- 'seven_days', 'two_days', 'one_day', 'day_of'
    sent_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    notification_method VARCHAR(20) NOT NULL,  -- 'email', 'sms', 'both'
    status VARCHAR(20) DEFAULT 'sent' NOT NULL,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(booking_id, reminder_type)
);

ALTER TABLE public.booking_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on booking_reminders" ON public.booking_reminders;
CREATE POLICY "Service role full access on booking_reminders" ON public.booking_reminders
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated read on booking_reminders" ON public.booking_reminders;
CREATE POLICY "Authenticated read on booking_reminders" ON public.booking_reminders
    FOR SELECT TO authenticated USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS ix_booking_reminders_booking ON public.booking_reminders(booking_id);
CREATE INDEX IF NOT EXISTS ix_booking_reminders_sent_at ON public.booking_reminders(sent_at);
