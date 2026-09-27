"""Assemble the multi-agent graph for one call and wire the handoffs.

Open/Closed: adding a new specialist is a new agents/<name>.py + a couple of
lines here — existing agents don't change. Agents are built per call so their
tools close over that call's CallContext.

Handoff topology (single RealtimeSession; handoffs keep audio + history):

    Triage <-> Info
    Triage <-> Booking -> Payments
    Triage <-> Payments
    Triage <-> Escalation
    (every specialist can return to Triage)
"""
from __future__ import annotations

from agents.realtime import RealtimeAgent, realtime_handoff

from context import CallContext
from .booking import build_booking_agent
from .escalation import build_escalation_agent
from .info import build_info_agent
from .payments import build_payments_agent
from .triage import build_triage_agent


def _to(agent: RealtimeAgent, desc: str):
    return realtime_handoff(agent, tool_description_override=desc)


def build_agent_graph(ctx: CallContext) -> RealtimeAgent:
    """Build all agents, wire their handoffs, and return the starting (Triage) agent."""
    triage = build_triage_agent(ctx)
    info = build_info_agent(ctx)
    booking = build_booking_agent(ctx)
    payments = build_payments_agent(ctx)
    escalation = build_escalation_agent(ctx)

    triage.handoffs = [
        _to(info, "Caller has a question about hours, prices, packages, or policies."),
        _to(booking, "Caller wants to book, reschedule, or check party availability."),
        _to(payments, "Caller wants to pay a deposit or balance."),
        _to(escalation, "Caller wants a human or has a complaint we can't resolve."),
    ]
    info.handoffs = [
        _to(triage, "Return to the receptionist."),
        _to(booking, "Caller now wants to book a party."),
    ]
    booking.handoffs = [
        _to(triage, "Return to the receptionist."),
        _to(payments, "Booking is ready and the caller wants to pay a deposit."),
        _to(escalation, "Caller needs a human for the booking."),
    ]
    payments.handoffs = [
        _to(triage, "Return to the receptionist."),
        _to(escalation, "Caller needs a human about the payment."),
    ]
    escalation.handoffs = [
        _to(triage, "Return to the receptionist."),
    ]
    return triage
