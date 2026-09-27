"""Payments agent — texts a secure Square link (no card data by voice)."""
from __future__ import annotations

from agents.realtime import RealtimeAgent

from context import CallContext
from tools.payment_tools import build_payment_tools

INSTRUCTIONS = """You handle phone payments for Playfunia. NEVER ask for or accept card \
numbers. Confirm the amount with the caller, then call send_payment_link to text them a \
secure Square link, and tell them to tap it to pay. A deposit is typical at booking. If \
they need anything else, hand back to Triage. Keep it short and reassuring."""


def build_payments_agent(ctx: CallContext) -> RealtimeAgent:
    return RealtimeAgent(name="Payments", instructions=INSTRUCTIONS,
                         tools=build_payment_tools(ctx))
