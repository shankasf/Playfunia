"""Booking tools — availability, price estimate, and party creation.

All transactional work is delegated to the backend HTTP API (see
backend_client.py); these tools only adapt the conversation's slot values into
the backend's request shapes and summarise responses for the model to speak.
"""
from __future__ import annotations

import logging
import re
from typing import Optional

from agents import function_tool

from config import settings
from context import CallContext

log = logging.getLogger("playfunia.voice.booking")


def _last10(phone: Optional[str]) -> Optional[str]:
    """Backend guest bookings want exactly 10 US digits; the SIP caller id is
    E.164 (+1XXXXXXXXXX). Strip to the last 10 digits."""
    if not phone:
        return None
    digits = re.sub(r"\D", "", phone)
    return digits[-10:] if len(digits) >= 10 else None


def build_booking_tools(ctx: CallContext) -> list:
    @function_tool
    async def list_party_packages() -> list:
        """List the bookable party packages with their id, name, base price,
        max guests, and whether food is included. Call this before checking
        availability or estimating a price so you can reference a real package id."""
        try:
            data = await ctx.backend.list_party_packages()
        except Exception as e:
            return [{"error": str(e)}]
        pkgs = data.get("packages", []) if isinstance(data, dict) else []
        return [
            {
                "id": p.get("id"),
                "name": p.get("name"),
                "basePrice": p.get("basePrice"),
                "maxGuests": p.get("maxGuests"),
                "includesFood": p.get("includesFood"),
            }
            for p in pkgs
        ]

    @function_tool
    async def check_availability(event_date: str,
                                 party_package_id: Optional[str] = None) -> dict:
        """Check open party time-slots for a date. event_date is YYYY-MM-DD.
        Optionally scope to a party_package_id. Returns the available start times."""
        try:
            return await ctx.backend.get_available_slots(
                location=settings.default_location,
                event_date=event_date,
                package_id=party_package_id,
            )
        except Exception as e:
            return {"error": str(e)}

    @function_tool
    async def estimate_party_price(party_package_id: str, guests: int,
                                   extra_adults: int = 0) -> dict:
        """Estimate the total price for a party: the package id, number of child
        guests, and any extra adults. Returns the priced breakdown to read back."""
        try:
            return await ctx.backend.estimate_price(
                party_package_id=party_package_id,
                location=settings.default_location,
                guests=guests,
                extra_adults=extra_adults,
            )
        except Exception as e:
            return {"error": str(e)}

    @function_tool
    async def book_party(
        first_name: str,
        last_name: str,
        email: str,
        child_name: str,
        party_package_id: str,
        event_date: str,
        start_time: str,
        guests: int,
        child_birth_date: Optional[str] = None,
        phone: Optional[str] = None,
    ) -> dict:
        """Create a guest party booking once all details are confirmed with the
        caller. event_date is YYYY-MM-DD, start_time is HH:MM (24h), guests is the
        child headcount. phone defaults to the number the caller is calling from.
        Returns the created booking (read the confirmation back to the caller)."""
        guest_phone = _last10(phone) or _last10(ctx.caller_phone)
        if not guest_phone:
            return {"error": "I need a 10-digit phone number to hold the booking."}

        payload = {
            "guestFirstName": first_name,
            "guestLastName": last_name,
            "guestEmail": email,
            "guestPhone": guest_phone,
            "childName": child_name,
            "partyPackageId": party_package_id,
            "location": settings.default_location,
            "eventDate": event_date,
            "startTime": start_time,
            "guests": guests,
        }
        if child_birth_date:
            payload["childBirthDate"] = child_birth_date

        try:
            result = await ctx.backend.create_guest_booking(payload)
        except Exception as e:
            return {"error": str(e)}

        # Remember the booking so the payments agent can attach a deposit link.
        booking_id = None
        if isinstance(result, dict):
            booking_id = result.get("id") or result.get("bookingId") or \
                (result.get("booking") or {}).get("id")
        ctx.booking_id = booking_id
        ctx.customer_name = f"{first_name} {last_name}".strip()
        return result if isinstance(result, dict) else {"result": result}

    return [list_party_packages, check_availability, estimate_party_price, book_party]
