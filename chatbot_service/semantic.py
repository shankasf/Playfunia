"""Vector search wrapper around the existing Chroma collection.

Exposed to the head agent as the `search_knowledge_base` tool (see tools.py).
"""
from __future__ import annotations

import os
from pathlib import Path

import chromadb
from openai import OpenAI

CHROMA_DIR = Path(__file__).resolve().parent / "chroma"
COLLECTION_NAME = "kidz4fun_rag"
OPENAI_EMBED_MODEL = os.getenv("OPENAI_EMBED_MODEL", "text-embedding-3-small")

_sync_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
_chroma_client = chromadb.PersistentClient(path=str(CHROMA_DIR))


def _collection():
    return _chroma_client.get_or_create_collection(
        COLLECTION_NAME,
        metadata={"embedding_model": OPENAI_EMBED_MODEL},
    )


def _embed(text: str) -> list[float]:
    resp = _sync_client.embeddings.create(model=OPENAI_EMBED_MODEL, input=[text])
    return resp.data[0].embedding


def semantic_search(query: str, k: int = 5) -> dict:
    coll = _collection()
    if coll.count() == 0:
        return {"results": [], "note": "knowledge base is empty"}
    vec = _embed(query)
    res = coll.query(query_embeddings=[vec], n_results=min(k, 10))
    docs = (res.get("documents") or [[]])[0]
    return {
        "results": [{"rank": i + 1, "passage": d.strip()} for i, d in enumerate(docs) if d],
        "count": len(docs),
    }
