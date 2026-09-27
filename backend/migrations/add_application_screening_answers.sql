-- Screening questions for job applications.
-- Every applicant (all listings) answers the same short screening questionnaire.
-- Answers are stored as a JSONB object keyed by question id, e.g.
--   {"partyPlanning": "yes", "openAvailability": "no", "availabilityDetails": "Weekends only"}

ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS screening_answers JSONB;
