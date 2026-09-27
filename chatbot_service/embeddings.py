"""Shared OpenAI embedding helpers.

Single source of truth for the embedding model + dimensionality used by both
the semantic-search read path (semantic.py) and the backfill writer
(scripts/backfill_pgvector.py). Keep them identical — a vector embedded with
one model/size cannot be compared against vectors written with another.

Model: text-embedding-3-large (OpenAI's strongest production embedder as of
2026-06). We request `dimensions=1536` (Matryoshka truncation) rather than the
native 3072 so the vectors stay a drop-in fit for the existing
`kb_chunks.embedding vector(1536)` column and its HNSW index — pgvector's HNSW
index caps the standard `vector` type at 2000 dims. 3-large @ 1536 still beats
text-embedding-3-small @ 1536 on retrieval quality, at the same storage cost.

If you ever want the full 3072-dim vectors, switch the column to
`halfvec(3072)` (HNSW-indexable up to 4000 dims on pgvector >= 0.7, which
Supabase ships) and set EMBED_DIMS = 3072 here.
"""
from __future__ import annotations

import os
from typing import Sequence

from openai import OpenAI

EMBED_MODEL = os.getenv("OPENAI_EMBED_MODEL", "text-embedding-3-large")
EMBED_DIMS = int(os.getenv("OPENAI_EMBED_DIMS", "1536"))

_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def embed_texts(texts: Sequence[str]) -> list[list[float]]:
    """Embed a batch of texts. Order of the returned vectors matches `texts`."""
    if not texts:
        return []
    resp = _client.embeddings.create(
        model=EMBED_MODEL,
        input=list(texts),
        dimensions=EMBED_DIMS,
    )
    return [item.embedding for item in resp.data]


def embed_query(text: str) -> list[float]:
    """Embed a single query string."""
    return embed_texts([text])[0]
