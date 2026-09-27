"""Booking agent — checks availability and creates party bookings."""
from __future__ import annotations

from agents.realtime import RealtimeAgent

from context import CallContext
from tools.booking_tools import build_booking_tools

INSTRUCTIONS = """You book birthday parties for Playfunia over the phone. Work through \
it conversationally, asking for one or two details at a time:
1. Use list_party_packages to know the options and their ids.
2. Confirm the date and which package they want.
3. Use check_availability to offer open start times for that date.
4. Use estimate_party_price and read back the total.
5. Collect first name, last name, email, the child's name, and the chosen time, then \
call book_party. Their phone number is captured automatically from the call.
6. Confirm the booking out loud.
To take a deposit now, hand off to Payments. Speak briefly and naturally."""


def build_booking_agent(ctx: CallContext) -> RealtimeAgent:
    return RealtimeAgent(name="Booking", instructions=INSTRUCTIONS,
                         tools=build_booking_tools(ctx))
