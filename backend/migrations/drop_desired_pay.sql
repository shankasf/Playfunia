-- Drop desired_pay and certifications columns from job_applications table
ALTER TABLE job_applications DROP COLUMN IF EXISTS desired_pay;
ALTER TABLE job_applications DROP COLUMN IF EXISTS certifications;
