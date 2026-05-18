-- Adds photo storage columns to the children table for membership identity verification.
-- Idempotent: safe to re-run.

ALTER TABLE public.children
    ADD COLUMN IF NOT EXISTS photo_url TEXT,
    ADD COLUMN IF NOT EXISTS photo_storage_path TEXT;
