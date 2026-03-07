-- Event Photos table for storing post-event photo galleries
-- Each event can have multiple photos stored in Supabase Storage

CREATE TABLE IF NOT EXISTS public.event_photos (
    photo_id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES public.events(event_id) ON DELETE CASCADE,
    photo_url TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    caption TEXT,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_photos_event_id ON public.event_photos(event_id);
