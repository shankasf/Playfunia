"""Payment tool — text a Square checkout link for a deposit.

Card data is never spoken to or handled by the model: the backend creates a
Square-hosted payment link and texts it to the caller via the existing SMS
service. This keeps all PCI-relevant handling inside the already-built Square
flow (see backend voice.controller.ts).
"""
from __future__ import annotations

import logging
import re
from typing import Optional

from agents import function_tool

from context import CallContext

log = logging.getLogger("playfunia.voice.payment")


def _last10(phone: Optional[str]) -> Optional[str]:
    if not phone:
        return None
    digits = re.sub(r"\D", "", phone)
    return digits[-10:] if len(digits) >= 10 else None


def build_payment_tools(ctx: CallContext) -> list:
    @function_tool
    async def send_payment_link(amount_dollars: float, description: str,
                                phone: Optional[str] = None) -> str:
        """Text the caller a secure Square payment link for a deposit or balance.
        amount_dollars is the charge in dollars (e.g. 50.00); description is a
        short label like 'Party deposit'. phone defaults to the caller's number.
        Confirm the amount with the caller before calling this. Returns a spoken
        confirmation that the text was sent."""
        to = _last10(phone) or _last10(ctx.caller_phone)
        if not to:
            return "I couldn't determine a phone number to text the link to."
        amount_cents = int(round(amount_dollars * 100))
        if amount_cents < 50:
            return "The minimum charge is fifty cents."
        try:
            await ctx.backend.create_payment_link(
                amount_cents=amount_cents,
                description=description,
                phone=to,
                booking_id=ctx.booking_id,
            )
        except Exception as e:
            log.warning("payment.link_failed", extra={"event": "payment.link_failed",
                                                      "amount_cents": amount_cents,
                                                      "error": str(e)})
            return f"I wasn't able to send the payment link: {e}"
        log.info("payment.link_sent", extra={"event": "payment.link_sent",
                                             "amount_cents": amount_cents,
                                             "to": f"***{to[-4:]}",
                                             "booking_id": ctx.booking_id,
                                             "description": description})
        return (f"I've texted a secure link for ${amount_dollars:.2f} to the number "
                f"ending in {to[-4:]}. You can tap it to pay whenever you're ready.")

    return [send_payment_link]
