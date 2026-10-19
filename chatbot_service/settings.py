"""Admin-managed chatbot settings, read live from Postgres.

The admin panel (/admin/chatbot) edits the single row in `chatbot_settings`.
This module reads it through the read-only role with a short TTL cache so a
change in the admin panel takes effect within ~30s with no restart, while the
hot path pays one cheap SELECT every 30s rather than per request.

Any failure (table missing, DB blip, bad types) degrades to the last good
values, or to DEFAULTS — the built-in behaviour the agent shipped with.
"""
from __future__ import annotations

import json
import logging
import os
import time
from typing import Any

from db import ro_cursor

log = logging.getLogger("playfunia.settings")

CACHE_TTL_SECONDS = float(os.getenv("CHATBOT_SETTINGS_TTL", "30"))

DEFAULTS: dict[str, Any] = {
    "enabled": True,
    "bot_name": "Playfunia Assistant",
    "model": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
    "temperature": 0.2,
    "system_prompt": None,
    "greeting": "Hi there! 👋 I'm the Playfunia assistant. Ask me about hours, tickets, parties, memberships or deals!",
    "quick_prompts": [],
    "capability_phrases": [],
    "max_tool_turns": 6,
    "kb_enabled": True,
    "kb_top_k": 5,
}

_cache: dict[str, Any] | None = None
_cache_at: float = 0.0
_cache_source: str = "default"


def _as_list(v: Any) -> list:
    if v is None:
        return []
    if isinstance(v, str):
        try:
            v = json.loads(v)
        except ValueError:
            return []
    return list(v) if isinstance(v, (list, tuple)) else []


def _normalize(row: dict) -> dict[str, Any]:
    prompt = row.get("system_prompt")
    prompt = prompt.strip() if isinstance(prompt, str) and prompt.strip() else None
    return {
        "enabled": bool(row.get("enabled", DEFAULTS["enabled"])),
        "bot_name": (row.get("bot_name") or DEFAULTS["bot_name"]),
        "model": (row.get("model") or DEFAULTS["model"]),
        "temperature": float(row.get("temperature") if row.get("temperature") is not None else DEFAULTS["temperature"]),
        "system_prompt": prompt,
        "greeting": (row.get("greeting") or DEFAULTS["greeting"]),
        "quick_prompts": _as_list(row.get("quick_prompts")),
        "capability_phrases": _as_list(row.get("capability_phrases")),
        "max_tool_turns": int(row.get("max_tool_turns") or DEFAULTS["max_tool_turns"]),
        "kb_enabled": bool(row.get("kb_enabled", DEFAULTS["kb_enabled"])),
        "kb_top_k": int(row.get("kb_top_k") or DEFAULTS["kb_top_k"]),
    }


def _load_from_db() -> dict[str, Any] | None:
    with ro_cursor() as cur:
        cur.execute("SELECT * FROM chatbot_settings WHERE id = 1")
        row = cur.fetchone()
    return _normalize(dict(row)) if row else None


def get_settings(force: bool = False) -> dict[str, Any]:
    """Effective settings (a copy). Cached for CACHE_TTL_SECONDS."""
    global _cache, _cache_at, _cache_source
    now = time.monotonic()
    if not force and _cache is not None and (now - _cache_at) < CACHE_TTL_SECONDS:
        return dict(_cache)
    try:
        loaded = _load_from_db()
        if loaded is None:
            log.warning("chatbot_settings row missing; using defaults")
            _cache, _cache_source = dict(DEFAULTS), "default"
        else:
            _cache, _cache_source = loaded, "db"
        _cache_at = now
    except Exception as e:  # keep serving the last good values
        log.warning("could not load chatbot_settings: %s", e)
        if _cache is None:
            _cache, _cache_source = dict(DEFAULTS), "default"
        _cache_at = now  # back off for one TTL before retrying the DB
    return dict(_cache)


def settings_debug() -> dict[str, Any]:
    """Effective settings plus provenance, for GET /settings/debug."""
    s = get_settings()
    age = round(time.monotonic() - _cache_at, 1) if _cache is not None else None
    return {**s, "source": _cache_source, "cache_age_seconds": age, "cache_ttl_seconds": CACHE_TTL_SECONDS}
