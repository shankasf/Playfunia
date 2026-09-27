"""Info/FAQ tool — delegates to the existing chatbot service.

Rather than re-implement Playfunia's ~24 structured-data tools + pgvector
search, the voice info agent forwards the caller's question to the chatbot's
/chat endpoint and reads back the answer. This is DRY (one source of business
facts), keeps the realtime agent's tool schema tiny (one tool = cheaper input
tokens every turn), and the answer is already grounded in the live DB.
"""
from __future__ import annotations

import logging
import time

import httpx
from agents import function_tool

from config import settings
from context import CallContext

log = logging.getLogger("playfunia.voice.info")


async def _ask_chatbot(question: str) -> str:
    url = f"{settings.chatbot_url.rstrip('/')}/chat"
    payload = {"messages": [{"role": "user", "content": question}]}
    t0 = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, json=payload)
        latency = round((time.monotonic() - t0) * 1000)
        if resp.status_code >= 400:
            log.warning("chatbot.error", extra={"event": "chatbot.ask", "ok": False,
                                                "status": resp.status_code,
                                                "latency_ms": latency,
                                                "question": question[:200]})
            return "I'm having trouble looking that up right now."
        reply = (resp.json().get("reply") or "").strip()
        log.info("chatbot.ask", extra={"event": "chatbot.ask", "ok": True,
                                       "latency_ms": latency,
                                       "question": question[:200],
                                       "reply_chars": len(reply)})
        return reply or "I couldn't find an answer to that."
    except httpx.HTTPError as e:
        log.warning("chatbot.unreachable", extra={"event": "chatbot.ask", "ok": False,
                                                  "error": str(e),
                                                  "latency_ms": round((time.monotonic() - t0) * 1000)})
        return "I'm having trouble looking that up right now."


def build_info_tools(ctx: CallContext) -> list:
    @function_tool
    async def ask_playfunia(question: str) -> str:
        """Answer a customer's question about Playfunia — hours, location,
        directions, pricing, tickets, memberships, party packages, add-ons,
        promotions, events, policies (waivers, refunds, food, age limits), or
        anything else about the business. Pass the caller's question in natural
        language; returns a spoken-ready answer grounded in live business data."""
        return await _ask_chatbot(question)

    return [ask_playfunia]
