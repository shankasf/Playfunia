"""Vector search over the pgvector knowledge base (kb_chunks / kb_search).

Replaces the previous ChromaDB implementation. Embeddings now live in the same
Supabase Postgres as the business data (see migrations/001_init_pgvector_kb.sql
and 002_kb_grants.sql), so there is no separate vector store to deploy, mount,
or keep in sync — one connection, one backup.

Exposed to the head agent as the `search_knowledge_base` tool (see tools.py).
The write side (populating kb_chunks) lives in scripts/backfill_pgvector.py.
"""
from __future__ import annotations

import logging

from db import ro_cursor
from embeddings import embed_query

log = logging.getLogger("playfunia.semantic")


def _vector_literal(vec: list[float]) -> str:
    """Render a Python float list as a pgvector text literal: '[0.1,0.2,...]'."""
    return "[" + ",".join(repr(float(x)) for x in vec) + "]"


def semantic_search(query: str, k: int = 5) -> dict:
    """Top-k cosine-nearest KB chunks for `query` via the kb_search() SQL fn.

    Returns the same shape the agent already expects from the old Chroma path:
    {"results": [{"rank", "passage", "title", "similarity"}], "count"}.
    """
    query = (query or "").strip()
    if not query:
        return {"results": [], "count": 0, "note": "empty query"}

    k = max(1, min(int(k), 10))
    try:
        vec = embed_query(query)
    except Exception as e:  # embedding call failed — degrade gracefully
        log.warning("embedding failed for semantic search: %s", e)
        return {"results": [], "count": 0, "note": "search temporarily unavailable"}

    sql = "SELECT title, content, similarity FROM kb_search(%(emb)s::vector, %(k)s, NULL)"
    try:
        with ro_cursor() as cur:
            cur.execute(sql, {"emb": _vector_literal(vec), "k": k})
            rows = cur.fetchall()
    except Exception as e:
        # Most likely cause: kb_chunks is empty (run backfill_pgvector.py) or the
        # readonly role lacks grants (apply migration 002). Don't crash the agent.
        log.warning("kb_search query failed: %s", e)
        return {"results": [], "count": 0, "note": "knowledge base unavailable"}

    results = []
    for i, r in enumerate(rows):
        passage = (r.get("content") or "").strip()
        if not passage:
            continue
        results.append({
            "rank": i + 1,
            "passage": passage,
            "title": r.get("title"),
            "similarity": round(float(r.get("similarity") or 0.0), 4),
        })

    if not results:
        return {"results": [], "count": 0, "note": "knowledge base is empty"}
    return {"results": results, "count": len(results)}
