"""Write-only logger for chatbot queries.

Uses a separate `chatbot_logger` Postgres role that has INSERT (+ SELECT for
debugging) on a single table — `public.chatbot_query_logs` — and access to
nothing else. Reads still happen through the `chatbot_readonly` role.

Logging is best-effort: failures are logged to stderr and never raised back
to the caller, so a logger outage cannot break user-facing replies.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

log = logging.getLogger("playfunia.logger")

PROJECT_REF = "wzmcmbkouodsfbfxaozd"
LOGGER_PG = dict(
    host=os.getenv("CHATBOT_LOGGER_HOST", "aws-0-us-west-2.pooler.supabase.com"),
    port=int(os.getenv("CHATBOT_LOGGER_PORT", "6543")),
    user=os.getenv("CHATBOT_LOGGER_USER", f"chatbot_logger.{PROJECT_REF}"),
    dbname=os.getenv("CHATBOT_LOGGER_DBNAME", "postgres"),
    password=os.environ.get("chatbot_logger_db_password"),
    sslmode="require",
    connect_timeout=5,
)


def _write_sync(payload: dict) -> None:
    """Synchronous insert — meant to run in a thread executor."""
    if not LOGGER_PG.get("password"):
        return
    sql = """
        INSERT INTO public.chatbot_query_logs
            (user_message, final_reply, tool_names, tool_calls,
             turn_count, latency_ms, error, model)
        VALUES (%(user_message)s, %(final_reply)s, %(tool_names)s,
                %(tool_calls)s::jsonb, %(turn_count)s, %(latency_ms)s,
                %(error)s, %(model)s)
    """
    try:
        with psycopg2.connect(**LOGGER_PG) as conn:
            with conn.cursor() as cur:
                cur.execute(sql, payload)
    except Exception as e:
        log.error("failed to write chatbot log: %s", e)


async def log_query(*, user_message: str, final_reply: str | None,
                    tool_calls: list[dict], turn_count: int,
                    latency_ms: int, error: str | None, model: str) -> None:
    """Fire-and-forget write. Returns immediately; the insert runs in a
    thread so it never blocks the HTTP response."""
    payload = {
        "user_message": (user_message or "")[:8000],
        "final_reply":  (final_reply or "")[:8000] if final_reply else None,
        "tool_names":   [tc.get("tool") for tc in tool_calls if tc.get("tool")],
        "tool_calls":   json.dumps(tool_calls, default=str, ensure_ascii=False)[:65000],
        "turn_count":   turn_count,
        "latency_ms":   latency_ms,
        "error":        (error or "")[:2000] if error else None,
        "model":        model,
    }
    try:
        await asyncio.to_thread(_write_sync, payload)
    except Exception as e:
        log.error("log_query failed: %s", e)
