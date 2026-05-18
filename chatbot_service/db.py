"""Read-only Postgres access for the chatbot.

All structured-data tools route through `ro_cursor()`. The combination of
(a) a role with SELECT only on public-content tables, (b) BYPASSRLS limited
to those tables, and (c) READ ONLY transactions means a buggy or malicious
tool cannot reach PII or mutate state.
"""
from __future__ import annotations

import os
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# Supabase pooler endpoint (IPv4) — the direct db.* hostname is IPv6-only and
# Docker default networks lack IPv6 routing. Project ref is part of the username.
PROJECT_REF = "wzmcmbkouodsfbfxaozd"
PG = dict(
    host=os.getenv("CHATBOT_DB_HOST", "aws-0-us-west-2.pooler.supabase.com"),
    port=int(os.getenv("CHATBOT_DB_PORT", "6543")),
    user=os.getenv("CHATBOT_DB_USER", f"chatbot_readonly.{PROJECT_REF}"),
    dbname=os.getenv("CHATBOT_DB_NAME", "postgres"),
    password=os.environ["chatbot_db_password"],
    sslmode="require",
    connect_timeout=5,
)

# Whitelist enforced at the application layer in addition to DB grants.
# Tools should only mention these table names. Defense in depth — if a query
# string is ever templated, this gives us a single place to assert against.
ALLOWED_TABLES: frozenset[str] = frozenset({
    "ticket_types", "membership_plans", "party_packages", "party_add_ons",
    "pricing_config", "promotions", "product_promotions", "promo_offers",
    "events", "job_listings", "locations", "store_hours", "faqs", "announcements",
})


@contextmanager
def ro_cursor() -> Iterator[psycopg2.extras.RealDictCursor]:
    """Yield a RealDictCursor on a READ ONLY transaction."""
    conn = psycopg2.connect(cursor_factory=psycopg2.extras.RealDictCursor, **PG)
    try:
        conn.set_session(readonly=True, autocommit=False)
        with conn.cursor() as cur:
            yield cur
        conn.rollback()  # READ ONLY makes commit meaningless; rollback to release
    finally:
        conn.close()


def fetch_all(cur, sql: str, params: tuple | dict | None = None) -> list[dict]:
    cur.execute(sql, params or ())
    return [dict(r) for r in cur.fetchall()]


def fetch_one(cur, sql: str, params: tuple | dict | None = None) -> dict | None:
    cur.execute(sql, params or ())
    row = cur.fetchone()
    return dict(row) if row else None
