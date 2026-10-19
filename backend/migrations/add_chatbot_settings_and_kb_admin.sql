-- Admin-managed chatbot config + knowledge base (pgvector) extensions.
-- Applied by hand with psql (see memory db-and-deploy-access).

-- 1. Single-row chatbot settings, read live by chatbot_service and the public widget.
CREATE TABLE IF NOT EXISTS chatbot_settings (
    id                 SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    enabled            BOOLEAN      NOT NULL DEFAULT TRUE,
    bot_name           TEXT         NOT NULL DEFAULT 'Playfunia Assistant',
    model              TEXT         NOT NULL DEFAULT 'gpt-4o-mini',
    temperature        NUMERIC(3,2) NOT NULL DEFAULT 0.20 CHECK (temperature >= 0 AND temperature <= 2),
    system_prompt      TEXT,                  -- NULL/empty => chatbot_service uses its built-in default
    greeting           TEXT         NOT NULL DEFAULT 'Hi there! 👋 I''m the Playfunia assistant. Ask me about hours, tickets, parties, memberships or deals!',
    quick_prompts      JSONB        NOT NULL DEFAULT '[]'::jsonb,   -- [{emoji,label,prompt}]
    capability_phrases JSONB        NOT NULL DEFAULT '[]'::jsonb,   -- ["Plan a birthday party 🎂", ...]
    max_tool_turns     INTEGER      NOT NULL DEFAULT 6 CHECK (max_tool_turns BETWEEN 1 AND 12),
    kb_enabled         BOOLEAN      NOT NULL DEFAULT TRUE,
    kb_top_k           INTEGER      NOT NULL DEFAULT 5 CHECK (kb_top_k BETWEEN 1 AND 10),
    updated_by         TEXT,
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

INSERT INTO chatbot_settings (id, quick_prompts, capability_phrases)
VALUES (
  1,
  '[{"emoji":"🎂","label":"Birthday party for 10 kids?","prompt":"How much for a birthday party for 10 kids?"},
    {"emoji":"⏰","label":"Are you open right now?","prompt":"Are you open right now?"},
    {"emoji":"🎟️","label":"Ticket prices","prompt":"What are your open play ticket prices?"},
    {"emoji":"💳","label":"Membership plans","prompt":"Tell me about your membership plans"},
    {"emoji":"🎁","label":"Current deals & promos","prompt":"What promotions are running right now?"},
    {"emoji":"❓","label":"Do we need a waiver?","prompt":"Do we need to sign a waiver?"}]'::jsonb,
  '["Plan a birthday party 🎂","Check today''s hours ⏰","Find ticket prices 🎟️","Compare memberships 💳","See current deals 🎁","Ask me anything ✨"]'::jsonb
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE chatbot_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON chatbot_settings;
CREATE POLICY "Service role full access" ON chatbot_settings TO service_role USING (true) WITH CHECK (true);
GRANT SELECT ON chatbot_settings TO chatbot_readonly;

-- 2. kb_documents: admin-facing columns.
ALTER TABLE kb_documents
    ADD COLUMN IF NOT EXISTS source_type  TEXT        NOT NULL DEFAULT 'text',   -- 'text' (inline editable) | 'file' (uploaded)
    ADD COLUMN IF NOT EXISTS file_name    TEXT,
    ADD COLUMN IF NOT EXISTS mime_type    TEXT,
    ADD COLUMN IF NOT EXISTS file_size    BIGINT,
    ADD COLUMN IF NOT EXISTS storage_path TEXT,                                  -- Supabase Storage path in bucket 'kb-files'
    ADD COLUMN IF NOT EXISTS status       TEXT        NOT NULL DEFAULT 'ready',  -- 'processing' | 'ready' | 'failed' | 'unsearchable'
    ADD COLUMN IF NOT EXISTS error        TEXT,
    ADD COLUMN IF NOT EXISTS is_enabled   BOOLEAN     NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS chunk_count  INTEGER     NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS created_by   TEXT;

ALTER TABLE kb_documents ALTER COLUMN content SET DEFAULT '';

-- The seeded text KB becomes the first admin-editable text document.
UPDATE kb_documents
   SET source_type = 'text',
       title = 'Playfunia Knowledge Base',
       chunk_count = (SELECT count(*) FROM kb_chunks c WHERE c.document_id = kb_documents.document_id),
       metadata = metadata || '{"seeded_from":"chatbot_service/data/playfunia_knowledge_base.txt"}'::jsonb
 WHERE source_table = 'kb_textfile';

ALTER TABLE kb_chunks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON kb_chunks;
CREATE POLICY "Service role full access" ON kb_chunks TO service_role USING (true) WITH CHECK (true);

-- 3. kb_search: skip disabled / not-ready documents.
CREATE OR REPLACE FUNCTION kb_search(
    query_embedding vector(1536),
    match_count INTEGER DEFAULT 5,
    source_filter TEXT[] DEFAULT NULL
)
RETURNS TABLE (
    chunk_id     BIGINT,
    document_id  BIGINT,
    source_table TEXT,
    entity_id    BIGINT,
    title        TEXT,
    content      TEXT,
    metadata     JSONB,
    similarity   REAL
)
LANGUAGE sql STABLE AS $$
    SELECT
        c.chunk_id,
        c.document_id,
        d.source_table,
        d.entity_id,
        d.title,
        c.content,
        d.metadata,
        1 - (c.embedding <=> query_embedding) AS similarity
    FROM kb_chunks c
    JOIN kb_documents d ON d.document_id = c.document_id
    WHERE d.is_enabled AND d.status = 'ready'
      AND (source_filter IS NULL OR d.source_table = ANY(source_filter))
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count;
$$;
GRANT EXECUTE ON FUNCTION kb_search(vector, integer, text[]) TO chatbot_readonly;

-- 4. Storage bucket for uploaded KB originals (private).
INSERT INTO storage.buckets (id, name, public)
VALUES ('kb-files', 'kb-files', false)
ON CONFLICT (id) DO NOTHING;
