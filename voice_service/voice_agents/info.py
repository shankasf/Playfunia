"""Info agent — answers FAQ/info questions via the chatbot knowledge base."""
from __future__ import annotations

from agents.realtime import RealtimeAgent

from context import CallContext
from tools.info_tools import build_info_tools

INSTRUCTIONS = """You answer questions about Playfunia for a phone caller. For any \
factual question — hours, location, prices, tickets, memberships, party packages, \
add-ons, promotions, events, or policies — call ask_playfunia and speak the answer \
back in one or two short sentences. Summarize; never read lists or links aloud. If \
the caller wants to book a party or make a payment, hand back to Triage. Keep it brief."""


def build_info_agent(ctx: CallContext) -> RealtimeAgent:
    return RealtimeAgent(name="Info", instructions=INSTRUCTIONS,
                         tools=build_info_tools(ctx))
