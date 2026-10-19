-- Migration: Add email_image_url to marketing_campaigns
-- Optional image shown in the campaign EMAIL (e.g. a party-room photo). Either
-- a public Supabase Storage URL (event-images/marketing/...) uploaded from the
-- admin Marketing page, or any external http(s) image URL. NULL = no image.

ALTER TABLE public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS email_image_url TEXT;

COMMENT ON COLUMN public.marketing_campaigns.email_image_url IS 'Optional public http(s) image URL embedded in the campaign email; NULL = no image';

-- Make PostgREST pick up the new column immediately
NOTIFY pgrst, 'reload schema';
