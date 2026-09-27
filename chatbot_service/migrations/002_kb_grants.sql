-- Playfunia chatbot/voice RAG: grant the read-only role access to the
-- pgvector knowledge base defined in 001_init_pgvector_kb.sql.
--
-- The chatbot_readonly role (used by both chatbot_service and voice_service)
-- has SELECT only on public-content tables. The KB tables were created after
-- that grant, so without this migration kb_search() raises "permission denied".
--
-- Embedding note: vectors are now produced by text-embedding-3-large requested
-- at dimensions=1536 (see embeddings.py). Same 1536-dim column as before, so no
-- schema change is needed — only a re-backfill (scripts/backfill_pgvector.py).

GRANT SELECT ON kb_documents   TO chatbot_readonly;
GRANT SELECT ON kb_chunks      TO chatbot_readonly;
GRANT SELECT ON kb_chunks_view TO chatbot_readonly;

-- kb_search() is LANGUAGE sql STABLE; EXECUTE lets the readonly role call it.
GRANT EXECUTE ON FUNCTION kb_search(vector, integer, text[]) TO chatbot_readonly;
