-- Internal hiring notes: track when a note was last edited and by whom.
--
-- job_applications.admin_notes already existed, but it was only editable as
-- part of the full applicant edit form and carried no provenance. These two
-- columns back the dedicated notes control (list + detail pages) so the
-- hiring team can see how fresh a note is and who last touched it.
--
-- admin_notes_updated_by stores the acting admin's email rather than a
-- users(user_id) FK on purpose: it is a display/provenance string for a note,
-- read on every list render, and should survive the admin account being
-- removed. No join needed to render it.

ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS admin_notes_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_notes_updated_by VARCHAR(255);

-- Backfill: applications that already carry a note get their last-modified
-- time as a best-effort "updated" stamp. Author is left NULL — it was never
-- recorded, and guessing it would be worse than showing nothing.
UPDATE public.job_applications
   SET admin_notes_updated_at = COALESCE(updated_at, created_at, now())
 WHERE admin_notes_updated_at IS NULL
   AND admin_notes IS NOT NULL
   AND btrim(admin_notes) <> '';
