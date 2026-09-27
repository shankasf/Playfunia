"""Escalation tools — reach a human.

Two paths, per the agreed design:
  * transfer_to_staff — warm SIP transfer of the live call to the staff phone
    (use during business hours).
  * request_callback  — log a callback request + notify staff by SMS (use after
    hours or when no one can take a live transfer).

The agent decides which to use from its instructions; each tool does exactly one
thing (Single Responsibility).
"""
from __future__ import annotations

import logging
import re
from typing import Optional

from agents import function_tool

from config import settings
from context import CallContext
from openai_telephony import refer_call

log = logging.getLogger("playfunia.voice.escalation")


def _last10(phone: Optional[str]) -> Optional[str]:
    if not phone:
        return None
    digits = re.sub(r"\D", "", phone)
    return digits[-10:] if len(digits) >= 10 else None


def build_escalation_tools(ctx: CallContext) -> list:
    @function_tool
    async def transfer_to_staff(reason: str) -> str:
        """Warm-transfer the live call to a Playfunia team member. Use during
        business hours when the caller needs a human. Say a brief goodbye to the
        caller BEFORE calling this — the call leaves our system on transfer. If
        the transfer can't be completed, fall back to request_callback."""
        if not settings.staff_phone:
            return ("No live agent line is configured. Offer to take a callback "
                    "instead with request_callback.")
        ok = await refer_call(ctx.call_id, f"tel:{settings.staff_phone}")
        log.info("escalation.transfer", extra={"event": "escalation.transfer", "ok": ok,
                                               "reason": reason[:200]})
        if ok:
            return "Transferring you to a team member now. One moment."
        return ("The transfer didn't go through. Offer to take a callback instead "
                "with request_callback.")

    @function_tool
    async def request_callback(name: str, reason: str,
                               preferred_time: Optional[str] = None) -> str:
        """Log a callback request and notify staff by text. Use after hours or
        when a live transfer isn't possible. name is the caller's name, reason is
        why they want a callback, preferred_time is optional (e.g. 'after 5pm').
        Returns a spoken confirmation."""
        phone = _last10(ctx.caller_phone)
        if not phone:
            return ("I couldn't capture your number automatically — what's the best "
                    "10-digit number to reach you?")
        try:
            await ctx.backend.request_callback(
                name=name, phone=phone, reason=reason, preferred_time=preferred_time,
            )
        except Exception as e:
            log.warning("escalation.callback_failed", extra={
                "event": "escalation.callback_failed", "error": str(e)})
            return f"I wasn't able to log the callback: {e}"
        log.info("escalation.callback", extra={"event": "escalation.callback",
                                               "to": f"***{phone[-4:]}",
                                               "reason": reason[:200]})
        when = f" {preferred_time}" if preferred_time else ""
        return (f"Thanks {name} — I've asked our team to call you back{when} at the "
                f"number ending in {phone[-4:]}.")

    return [transfer_to_staff, request_callback]
