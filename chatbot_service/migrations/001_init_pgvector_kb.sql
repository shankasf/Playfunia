-- Playfunia chatbot RAG: pgvector schema
-- Embedding model: text-embedding-3-small (1536 dims). Switch to 3072 if upgrading to -large.

CREATE EXTENSION IF NOT EXISTS vector;

-- One row per source business record (events, packages, FAQs, etc.). Chunks point here.
CREATE TABLE IF NOT EXISTS kb_documents (
    document_id   BIGSERIAL PRIMARY KEY,
    source_table  TEXT        NOT NULL,
    entity_id     BIGINT,
    title         TEXT        NOT NULL,
    content       TEXT        NOT NULL,
    metadata      JSONB       NOT NULL DEFAULT '{}'::jsonb,
    content_hash  TEXT        NOT NULL,
    source_updated_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source_table, entity_id)
);

CREATE INDEX IF NOT EXISTS kb_documents_source_idx
    ON kb_documents (source_table);

-- One row per embeddable chunk. A doc with short content has exactly one chunk.
CREATE TABLE IF NOT EXISTS kb_chunks (
    chunk_id      BIGSERIAL PRIMARY KEY,
    document_id   BIGINT      NOT NULL REFERENCES kb_documents(document_id) ON DELETE CASCADE,
    chunk_index   INTEGER     NOT NULL,
    content       TEXT        NOT NULL,
    token_count   INTEGER,
    embedding     vector(1536) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (document_id, chunk_index)
);

-- HNSW gives better recall than IVFFlat at our small scale (~40 docs) and grows well.
-- Cosine matches OpenAI's normalized embeddings.
CREATE INDEX IF NOT EXISTS kb_chunks_embedding_hnsw
    ON kb_chunks USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Convenience view: top fields without pulling the embedding blob every time.
CREATE OR REPLACE VIEW kb_chunks_view AS
SELECT
    c.chunk_id,
    c.document_id,
    c.chunk_index,
    c.content,
    c.token_count,
    d.source_table,
    d.entity_id,
    d.title,
    d.metadata,
    d.source_updated_at
FROM kb_chunks c
JOIN kb_documents d ON d.document_id = c.document_id;

-- Similarity search helper. Call with the query embedding and (optionally) a source filter.
-- Example:
--   SELECT * FROM kb_search(:query_embedding, 5, ARRAY['membership_plans','party_packages']);
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
    WHERE source_filter IS NULL OR d.source_table = ANY(source_filter)
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count;
$$;

-- Touch updated_at on document changes.
CREATE OR REPLACE FUNCTION kb_documents_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS kb_documents_updated_at ON kb_documents;
CREATE TRIGGER kb_documents_updated_at
    BEFORE UPDATE ON kb_documents
    FOR EACH ROW EXECUTE FUNCTION kb_documents_touch_updated_at();
