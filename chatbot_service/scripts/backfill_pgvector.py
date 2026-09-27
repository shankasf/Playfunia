"""Embed the text knowledge base into pgvector (kb_documents / kb_chunks).

This is the WRITE side of the RAG store. The agent reads via semantic.py
(read-only role + kb_search()); this script populates what that function
searches. Run it once after applying the migrations, and again whenever
data/playfunia_knowledge_base.txt changes (regenerate that file first with
scripts/export_kb_text.py).

    python scripts/backfill_pgvector.py

It connects with the privileged Postgres role (supabase_db_password) because
inserting requires write access the chatbot_readonly role does not have. It is
idempotent: each source file maps to one kb_documents row keyed by a stable
hash of its path; unchanged files (same content_hash) are skipped, and changed
files have their chunks fully replaced.
"""
from __future__ import annotations

import hashlib
import os
import sys
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

# Make sibling modules (embeddings.py, ingest.py) importable when run as a script.
SERVICE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVICE_DIR))

from embeddings import EMBED_DIMS, EMBED_MODEL, embed_texts  # noqa: E402
from ingest import chunk_text  # noqa: E402

load_dotenv(SERVICE_DIR.parent / ".env")

DATA_DIR = SERVICE_DIR / "data"
SOURCE_TABLE = "kb_textfile"
SUPPORTED = {".txt", ".md", ".markdown"}

# Direct (write) connection — mirrors scripts/export_kb_text.py.
PG = dict(
    host=os.getenv("KB_WRITE_DB_HOST", "db.wzmcmbkouodsfbfxaozd.supabase.co"),
    port=int(os.getenv("KB_WRITE_DB_PORT", "5432")),
    user=os.getenv("KB_WRITE_DB_USER", "postgres"),
    dbname=os.getenv("KB_WRITE_DB_NAME", "postgres"),
    password=os.environ["supabase_db_password"],
    sslmode="require",
)


def _entity_id(rel_path: str) -> int:
    """Stable positive BIGINT derived from the file path (for UNIQUE upsert)."""
    return int.from_bytes(hashlib.sha1(rel_path.encode("utf-8")).digest()[:6], "big")


def _vec_literal(vec: list[float]) -> str:
    return "[" + ",".join(repr(float(x)) for x in vec) + "]"


def backfill() -> None:
    if not DATA_DIR.exists():
        print(f"[backfill] data dir not found: {DATA_DIR}")
        return

    files = sorted(p for p in DATA_DIR.glob("**/*")
                   if p.is_file() and p.suffix.lower() in SUPPORTED)
    if not files:
        print(f"[backfill] no source files in {DATA_DIR}")
        return

    print(f"[backfill] model={EMBED_MODEL} dims={EMBED_DIMS} files={len(files)}")
    conn = psycopg2.connect(cursor_factory=psycopg2.extras.RealDictCursor, **PG)
    try:
        conn.autocommit = False
        total_chunks = 0
        for path in files:
            try:
                content = path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                content = path.read_text(encoding="latin-1")

            rel_path = str(path.relative_to(DATA_DIR))
            entity_id = _entity_id(rel_path)
            content_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()

            with conn.cursor() as cur:
                # Skip unchanged files.
                cur.execute(
                    "SELECT document_id, content_hash FROM kb_documents "
                    "WHERE source_table = %s AND entity_id = %s",
                    (SOURCE_TABLE, entity_id),
                )
                existing = cur.fetchone()
                if existing and existing["content_hash"] == content_hash:
                    print(f"[backfill] unchanged, skip: {rel_path}")
                    continue

                # Upsert the document row.
                cur.execute(
                    """
                    INSERT INTO kb_documents
                        (source_table, entity_id, title, content, content_hash, metadata)
                    VALUES (%s, %s, %s, %s, %s, %s::jsonb)
                    ON CONFLICT (source_table, entity_id) DO UPDATE
                        SET title = EXCLUDED.title,
                            content = EXCLUDED.content,
                            content_hash = EXCLUDED.content_hash,
                            metadata = EXCLUDED.metadata
                    RETURNING document_id
                    """,
                    (SOURCE_TABLE, entity_id, rel_path, content, content_hash,
                     '{"kind": "text_kb"}'),
                )
                document_id = cur.fetchone()["document_id"]

                # Replace this document's chunks.
                cur.execute("DELETE FROM kb_chunks WHERE document_id = %s", (document_id,))

                chunks = chunk_text(content)
                if not chunks:
                    print(f"[backfill] no chunks: {rel_path}")
                    conn.commit()
                    continue

                vectors = embed_texts(chunks)
                rows = [
                    (document_id, idx, chunk, len(chunk) // 4, _vec_literal(vec))
                    for idx, (chunk, vec) in enumerate(zip(chunks, vectors))
                ]
                psycopg2.extras.execute_values(
                    cur,
                    "INSERT INTO kb_chunks "
                    "(document_id, chunk_index, content, token_count, embedding) "
                    "VALUES %s",
                    rows,
                    template="(%s, %s, %s, %s, %s::vector)",
                )
                conn.commit()
                total_chunks += len(chunks)
                print(f"[backfill] {rel_path}: {len(chunks)} chunks")

        print(f"[backfill] done. {total_chunks} chunks embedded.")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    backfill()
