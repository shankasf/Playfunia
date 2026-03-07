-- Migration: Add waiver_code column to waiver_submissions
-- A short 6-char alphanumeric code shown to customers at check-in

ALTER TABLE waiver_submissions
  ADD COLUMN IF NOT EXISTS waiver_code VARCHAR(8);

-- Unique index for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_waiver_submissions_waiver_code
  ON waiver_submissions(waiver_code)
  WHERE waiver_code IS NOT NULL;

-- Backfill existing rows with generated codes
-- Character set excludes ambiguous chars (0, O, I, 1, L)
DO $$
DECLARE
  rec RECORD;
  new_code TEXT;
  chars TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  i INT;
  collision BOOLEAN;
BEGIN
  FOR rec IN SELECT submission_id FROM waiver_submissions WHERE waiver_code IS NULL
  LOOP
    collision := TRUE;
    WHILE collision LOOP
      new_code := '';
      FOR i IN 1..6 LOOP
        new_code := new_code || substr(chars, floor(random() * 30 + 1)::int, 1);
      END LOOP;
      -- Check for collision
      PERFORM 1 FROM waiver_submissions WHERE waiver_code = new_code;
      collision := FOUND;
    END LOOP;
    UPDATE waiver_submissions SET waiver_code = new_code WHERE submission_id = rec.submission_id;
  END LOOP;
END $$;
