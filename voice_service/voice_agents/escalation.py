"""Escalation agent — warm transfer to staff or take a callback."""
from __future__ import annotations

from agents.realtime import RealtimeAgent

from context import CallContext
from tools.escalation_tools import build_escalation_tools

INSTRUCTIONS = """You connect Playfunia callers to a human. During business hours, give a \
brief goodbye and use transfer_to_staff to warm-transfer the call. After hours, or if a \
transfer fails, use request_callback to take the caller's name and reason so the team can \
call back. Be reassuring and brief. For anything else, hand back to Triage."""


def build_escalation_agent(ctx: CallContext) -> RealtimeAgent:
    return RealtimeAgent(name="Escalation", instructions=INSTRUCTIONS,
                         tools=build_escalation_tools(ctx))
