"""Head agent: orchestrates tool calls and returns a final answer.

The agent has access to:
  * ~24 structured-data tools (curated SQL behind each one — see tools.py)
  * One semantic-search tool over the text KB

The LLM is the router. It inspects the question, chooses the right tool(s),
calls them (possibly several in sequence for multi-step queries), then writes
a final answer using the tool results.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time as _time
from typing import Any

from openai import AsyncOpenAI, OpenAIError

from logger import log_query
from tools import TOOL_HANDLERS, TOOL_SCHEMAS, get_location

log = logging.getLogger("playfunia.agent")

OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
MAX_TOOL_TURNS = 6   # safety cap — each turn = one round of tool calls


def _load_store_contact() -> dict:
    """Read store phone/email from the DB once at module load.

    Used to render the contact line in the system prompt so every "contact us
    directly" fallback the model emits includes the actual number, not a
    generic instruction. Falls back to None if the DB is briefly unreachable —
    the agent still works, the line is just omitted.
    """
    try:
        locs = (get_location() or {}).get("locations") or []
        if locs:
            l = locs[0]
            return {"phone": l.get("phone"), "email": l.get("email"),
                    "name": l.get("name") or "Playfunia"}
    except Exception as e:
        log.warning("could not load store contact at startup: %s", e)
    return {"phone": None, "email": None, "name": "Playfunia"}


STORE_CONTACT = _load_store_contact()
_CONTACT_LINE = ""
if STORE_CONTACT.get("phone"):
    _CONTACT_LINE = f"phone {STORE_CONTACT['phone']}"
    if STORE_CONTACT.get("email"):
        _CONTACT_LINE += f" or email {STORE_CONTACT['email']}"


SYSTEM_PROMPT = f"""You are the Playfunia customer support chatbot for an indoor children's play center in Albany, NY.

You have access to two kinds of tools:

1. STRUCTURED tools (preferred for anything quantitative, comparative, or transactional):
   tickets, memberships, party packages, add-ons, promotions, hours, location,
   fees, events, jobs, faqs, announcements. These run real SQL against the live
   business database and return authoritative facts.

2. search_knowledge_base — semantic search over a curated knowledge base text file.
   Use ONLY when the question is open-ended/descriptive and no structured tool fits.

Rules:
- For "cheapest", "best for N kids", "how much for a party of X", or any other
  comparative / numerical question — ALWAYS call a structured tool. Do not do
  the math yourself; the tools already compute totals and recommendations.
- NEVER invent filter values. If the user did not give an explicit budget,
  family size, or feature requirement, do NOT pass max_price, covers_children,
  etc. Use sort + limit instead. "Cheapest X" = sort=price_asc, limit=1, NO
  other filters.
- Quote prices and dates exactly as the tools return them (e.g. "$599",
  "June 18, 2026"). Never invent or estimate numbers.
- If a tool returns an error, an empty result, or otherwise indicates that
  a specific named entity (a plan, package, promo code, event, etc.) does
  not exist, DO NOT retry with alternative tools or fabricate details.
  Tell the user that entity does not exist or is not currently offered.
- Whenever you tell a customer to "contact Playfunia directly" — for missing
  information, unsupported requests, or anything the tools cannot answer —
  ALWAYS include the contact details in the same sentence: {_CONTACT_LINE or 'phone number from get_location'}.
  Never leave a customer to find the contact info on their own.
- Keep answers concise (1–4 sentences). For totals/breakdowns, you may bullet
  the cost lines, but only with values the tool returned.
- Never share or speculate about customer data, bookings, accounts, payments,
  or other people's information. You only have access to public business info.
- You may call multiple tools in one turn (parallel) or in sequence when an
  answer needs them.
"""


client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))


async def _dispatch_tool(name: str, arguments_json: str) -> str:
    """Run one tool call and return its JSON-serialized result."""
    handler = TOOL_HANDLERS.get(name)
    if handler is None:
        return json.dumps({"error": f"unknown tool '{name}'"})
    try:
        args: dict[str, Any] = json.loads(arguments_json or "{}")
    except json.JSONDecodeError as e:
        return json.dumps({"error": f"invalid tool arguments: {e}"})
    try:
        result = handler(**args)
    except TypeError as e:
        return json.dumps({"error": f"bad arguments for {name}: {e}"})
    except Exception as e:
        log.exception("tool %s failed", name)
        return json.dumps({"error": f"{name} failed: {e}"})
    try:
        return json.dumps(result, default=str, ensure_ascii=False)
    except (TypeError, ValueError) as e:
        return json.dumps({"error": f"serialization failure: {e}"})


async def run(messages: list[dict]) -> dict:
    """Run the head agent. ``messages`` is the user-facing chat history.

    Returns ``{"reply": str, "tool_calls": [...]}``. Every call is logged
    fire-and-forget to public.chatbot_query_logs for analytics.
    """
    convo: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}, *messages]
    tool_trace: list[dict] = []
    user_message = next((m["content"] for m in reversed(messages)
                         if m.get("role") == "user"), "") or ""
    started = _time.monotonic()
    turn_count = 0
    final_reply: str | None = None
    error: str | None = None

    try:
        for turn in range(MAX_TOOL_TURNS):
            turn_count = turn + 1
            try:
                resp = await client.chat.completions.create(
                    model=OPENAI_MODEL,
                    messages=convo,
                    tools=TOOL_SCHEMAS,
                    temperature=0.2,
                )
            except OpenAIError as e:
                log.exception("openai call failed")
                error = f"openai_error: {e}"
                final_reply = "I ran into an error reaching the language model. Please try again."
                return {"reply": final_reply, "tool_calls": tool_trace, "error": error}

            msg = resp.choices[0].message
            tool_calls = msg.tool_calls or []

            if not tool_calls:
                final_reply = (msg.content or "").strip()
                return {"reply": final_reply, "tool_calls": tool_trace}

            convo.append({
                "role": "assistant",
                "content": msg.content,
                "tool_calls": [{
                    "id": tc.id, "type": "function",
                    "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                } for tc in tool_calls],
            })

            for tc in tool_calls:
                result_json = await _dispatch_tool(tc.function.name, tc.function.arguments)
                tool_trace.append({
                    "tool": tc.function.name,
                    "arguments": tc.function.arguments,
                    "result_preview": result_json[:200] + ("…" if len(result_json) > 200 else ""),
                })
                convo.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result_json,
                })

        error = "max_tool_turns_exceeded"
        final_reply = "I'm having trouble pulling that together. Please try rephrasing or contact Playfunia directly."
        return {"reply": final_reply, "tool_calls": tool_trace, "error": error}
    finally:
        latency_ms = int((_time.monotonic() - started) * 1000)
        # Fire-and-forget; never await — logging must not block the response.
        asyncio.create_task(log_query(
            user_message=user_message,
            final_reply=final_reply,
            tool_calls=tool_trace,
            turn_count=turn_count,
            latency_ms=latency_ms,
            error=error,
            model=OPENAI_MODEL,
        ))
