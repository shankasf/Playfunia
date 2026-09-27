"""Shared text chunking for the knowledge-base ingest.

Moved out of main.py when the semantic store migrated from ChromaDB to pgvector
so the backfill writer (scripts/backfill_pgvector.py) can reuse the exact same
chunk boundaries the retrieval path was designed around.

`chunk_text` is section-aware: it splits on `## ` headers first, then on
paragraph breaks, and finally hard-wraps anything still over `max_chars` at
sentence boundaries — keeping a header prefix on every emitted chunk so each one
stays self-describing for embedding.
"""
from __future__ import annotations

from typing import List


def chunk_text(text: str, max_chars: int = 1800) -> List[str]:
    if not text:
        return []
    sections: List[tuple[str | None, str]] = []
    current_header: str | None = None
    current_body: List[str] = []
    for line in text.splitlines():
        if line.startswith("## "):
            if current_header is not None or current_body:
                sections.append((current_header, "\n".join(current_body).strip()))
            current_header = line.rstrip()
            current_body = []
        else:
            current_body.append(line)
    if current_header is not None or current_body:
        sections.append((current_header, "\n".join(current_body).strip()))

    chunks: List[str] = []
    for header, body in sections:
        if not body and not header:
            continue
        paragraphs = [p.strip() for p in body.split("\n\n") if p.strip()]
        merged: List[str] = []
        i = 0
        while i < len(paragraphs):
            p = paragraphs[i]
            if p.startswith("### ") and "\n" not in p and i + 1 < len(paragraphs):
                merged.append(p + "\n\n" + paragraphs[i + 1])
                i += 2
            else:
                merged.append(p)
                i += 1
        paragraphs = merged or [""]
        header_prefix = (header + "\n\n") if header else ""
        for p in paragraphs:
            chunk = header_prefix + p
            while len(chunk) > max_chars:
                cut = chunk.rfind(". ", len(header_prefix), max_chars)
                if cut == -1:
                    cut = max_chars
                chunks.append(chunk[: cut + 1].strip())
                rest = chunk[cut + 1:].strip()
                chunk = header_prefix + rest
            if chunk.strip():
                chunks.append(chunk)
    return chunks
