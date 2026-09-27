-- Auto-archive for job applications
-- An application is "archived" (moved out of the active inbox) once it reaches a
-- terminal stage: hired, rejected, or withdrawn. archived_at is NULL while the
-- application is active and set to a timestamp when it is archived. Archiving is
-- reversible: reopening to an active stage clears archived_at.

ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Backfill: archive existing applications already in a terminal stage.
UPDATE public.job_applications
   SET archived_at = COALESCE(updated_at, now())
 WHERE archived_at IS NULL
   AND status IN ('hired', 'rejected', 'withdrawn');

CREATE INDEX IF NOT EXISTS idx_job_applications_archived_at
  ON public.job_applications (archived_at);
