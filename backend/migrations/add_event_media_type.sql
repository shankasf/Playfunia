-- Add media_type column to event_photos table
-- Supports 'image' (default) and 'video'

ALTER TABLE event_photos
  ADD COLUMN IF NOT EXISTS media_type VARCHAR(10) DEFAULT 'image';

ALTER TABLE event_photos
  ADD CONSTRAINT event_photos_media_type_check
  CHECK (media_type IN ('image', 'video'));
