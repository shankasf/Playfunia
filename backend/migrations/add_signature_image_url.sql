-- Add signature_image_url column to waiver_submissions for handwritten signature pad images
-- Nullable so old records remain unaffected
ALTER TABLE waiver_submissions
  ADD COLUMN IF NOT EXISTS signature_image_url TEXT NULL;

COMMENT ON COLUMN waiver_submissions.signature_image_url IS 'URL of the handwritten signature image stored in Supabase Storage (waiver-signatures bucket)';
