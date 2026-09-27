"""Structured logging for the voice service.

Every log line is JSON (one event per line — friendly to `docker logs`, Loki,
CloudWatch, Datadog, etc.) and carries the active `call_id` so all lines for a
single phone call can be grep'd/correlated. PII (phone numbers) is masked to the
last 4 digits unless disabled.

Use `bind_call(call_id)` at the start of each call's coroutine; every log emitted
within that async context (and its child tasks) inherits the id automatically
via contextvars.
"""
from __future__ import annotations

import contextvars
import json
import logging
import re
import sys
from datetime import datetime, timezone

from config import settings

# Active call id for the current async context. asyncio tasks copy the context,
# so setting this inside a per-call coroutine scopes it to that call.
_call_id: contextvars.ContextVar[str] = contextvars.ContextVar("call_id", default="-")

_STD_ATTRS = set(logging.makeLogRecord({}).__dict__.keys()) | {"taskName"}

# Only these logger trees are "AI services" — the realtime agent, the SDK, and
# our voice app modules. Everything else (uvicorn, httpx, watchfiles, websockets)
# is infrastructure noise and is filtered out so the log stream is AI-only.
_AI_LOGGER_PREFIXES = ("playfunia.voice", "openai.agents", "agents.realtime", "agents")


class _AiOnlyFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return record.name.startswith(_AI_LOGGER_PREFIXES)


def bind_call(call_id: str) -> None:
    _call_id.set(call_id or "-")


def mask_phone(phone: str | None) -> str | None:
    if not phone:
        return phone
    if not settings.mask_pii:
        return phone
    digits = re.sub(r"\D", "", phone)
    return f"***{digits[-4:]}" if len(digits) >= 4 else "***"


def clip(text, limit: int = 500):
    """Trim long strings for logs (transcripts, tool results)."""
    if text is None:
        return None
    s = text if isinstance(text, str) else json.dumps(text, default=str)
    return s if len(s) <= limit else s[:limit] + f"…(+{len(s) - limit} chars)"


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        out = {
            "ts": datetime.fromtimestamp(record.created, timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "call_id": _call_id.get(),
            "msg": record.getMessage(),
        }
        # Merge any structured extras passed via logger.info(..., extra={...}).
        for k, v in record.__dict__.items():
            if k not in _STD_ATTRS and k not in out:
                out[k] = v
        if record.exc_info:
            out["exc"] = self.formatException(record.exc_info)
        return json.dumps(out, default=str)


class _TextFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        extras = {
            k: v for k, v in record.__dict__.items()
            if k not in _STD_ATTRS and k not in ("message",)
        }
        suffix = (" " + json.dumps(extras, default=str)) if extras else ""
        base = f"{self.formatTime(record)} {record.levelname:5} [{_call_id.get()}] {record.name}: {record.getMessage()}"
        if record.exc_info:
            base += "\n" + self.formatException(record.exc_info)
        return base + suffix


def configure() -> None:
    """Install the root handler. Idempotent."""
    root = logging.getLogger()
    root.handlers.clear()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(_JsonFormatter() if settings.log_json else _TextFormatter())
    handler.addFilter(_AiOnlyFilter())  # AI services only
    root.addHandler(handler)
    root.setLevel(getattr(logging, settings.log_level, logging.INFO))
    # The OpenAI Agents SDK logs under "openai.agents"; let it flow through.
    logging.getLogger("openai.agents").setLevel(
        getattr(logging, settings.log_level, logging.INFO)
    )
    # Silence infrastructure loggers entirely (request/reload/transport noise) so
    # the stream is AI-only. The filter above already drops them; raising their
    # level avoids even constructing the records.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access", "httpx",
                 "httpcore", "watchfiles", "watchfiles.main", "websockets"):
        logging.getLogger(name).setLevel(logging.WARNING)
    logging.getLogger("playfunia.voice").info(
        "logging configured", extra={"event": "startup",
                                     "level": settings.log_level,
                                     "json": settings.log_json,
                                     "transcripts": settings.log_transcripts}
    )
