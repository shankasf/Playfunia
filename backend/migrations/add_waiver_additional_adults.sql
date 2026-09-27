-- Migration: Add additional_adults to waiver_submissions
-- Every adult (18+) entering with the family is listed on the waiver and signs
-- for themselves on the same tablet. The primary guardian stays in the
-- guardian_* columns; each extra adult is one entry here:
--   { "name": "...", "typedSignature": "...", "signatureImageUrl": "<storage path>", "signedAt": "<iso>" }
-- Teens (13-17) are minors signed for by the guardian and live alongside kids
-- in waiver_user_children / children, classified by age on read.

ALTER TABLE waiver_submissions
  ADD COLUMN IF NOT EXISTS additional_adults JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN waiver_submissions.additional_adults IS 'Additional adults (18+) on this waiver, each with their own signature: [{name, typedSignature, signatureImageUrl, signedAt}]';

-- Make PostgREST pick up the new column immediately
NOTIFY pgrst, 'reload schema';
