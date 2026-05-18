-- Adds Twilio delivery-tracking columns to notification_queue so the
-- /api/webhooks/twilio/status endpoint can mark queued SMS rows as failed
-- when a carrier rejects, instead of relying solely on the create() result.

ALTER TABLE notification_queue
  ADD COLUMN IF NOT EXISTS provider_message_sid TEXT,
  ADD COLUMN IF NOT EXISTS delivery_status TEXT,
  ADD COLUMN IF NOT EXISTS delivery_error_code TEXT,
  ADD COLUMN IF NOT EXISTS delivery_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notification_queue_provider_sid
  ON notification_queue(provider_message_sid)
  WHERE provider_message_sid IS NOT NULL;
