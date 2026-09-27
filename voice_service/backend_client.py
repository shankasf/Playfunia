"""HTTP client to the Playfunia backend (Express) API.

This is the seam that keeps the voice service's responsibility narrow: it
*orchestrates the conversation* and delegates every transactional action
(availability, bookings, payment links, callbacks) to the backend, which already
owns the authoritative booking + Square + SMS logic. Tools depend on this
interface, not on the HTTP details — so it can be faked in tests (Dependency
Inversion / Single Responsibility).

Request shapes mirror the backend zod schemas exactly:
  - GET  /api/bookings/slots      ?location&eventDate&packageId
  - POST /api/bookings/estimate   {partyPackageId, location, guests, extraAdults?, addOns?}
  - POST /api/bookings/guest      {guestFirstName, guestLastName, guestEmail, guestPhone, ...}
  - POST /api/voice/payment-link  {amountCents, description, phone, bookingId?}   (new)
  - POST /api/voice/callback      {name, phone, reason, preferredTime?}            (new)
"""
from __future__ import annotations

import logging
import time
from typing import Any, Optional

import httpx

log = logging.getLogger("playfunia.voice.backend")


class BackendError(Exception):
    """Raised when the backend returns a non-2xx the tool should surface aloud."""


class BackendClient:
    def __init__(self, base_url: str, secret: str, timeout: float = 12.0):
        self._base = base_url.rstrip("/")
        self._headers = {"X-Voice-Secret": secret, "Content-Type": "application/json"}
        self._timeout = timeout

    async def _request(self, method: str, path: str, **kw) -> Any:
        url = f"{self._base}{path}"
        t0 = time.monotonic()
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            try:
                resp = await client.request(method, url, headers=self._headers, **kw)
            except httpx.HTTPError as e:
                log.warning("backend.transport_error", extra={
                    "event": "backend.call", "method": method, "path": path,
                    "ok": False, "error": str(e),
                    "latency_ms": round((time.monotonic() - t0) * 1000)})
                raise BackendError("I couldn't reach our booking system just now.") from e
        latency = round((time.monotonic() - t0) * 1000)
        if resp.status_code >= 400:
            detail = _extract_message(resp)
            log.warning("backend.error", extra={
                "event": "backend.call", "method": method, "path": path,
                "status": resp.status_code, "ok": False,
                "latency_ms": latency, "detail": detail})
            raise BackendError(detail or "That request didn't go through.")
        log.info("backend.ok", extra={
            "event": "backend.call", "method": method, "path": path,
            "status": resp.status_code, "ok": True, "latency_ms": latency})
        return resp.json() if resp.content else {}

    # --- reads -------------------------------------------------------------
    async def list_party_packages(self) -> Any:
        """Public catalogue: party packages with ids/names/prices."""
        return await self._request("GET", "/api/party-packages")

    async def get_available_slots(self, location: str, event_date: str,
                                  package_id: Optional[str] = None) -> Any:
        params = {"location": location, "eventDate": event_date}
        if package_id:
            params["packageId"] = package_id
        return await self._request("GET", "/api/bookings/slots", params=params)

    async def estimate_price(self, party_package_id: str, location: str, guests: int,
                             extra_adults: int = 0, add_ons: Optional[list] = None) -> Any:
        body = {
            "partyPackageId": party_package_id,
            "location": location,
            "guests": guests,
            "extraAdults": extra_adults,
        }
        if add_ons:
            body["addOns"] = add_ons
        return await self._request("POST", "/api/bookings/estimate", json=body)

    # --- writes ------------------------------------------------------------
    async def create_guest_booking(self, payload: dict) -> Any:
        return await self._request("POST", "/api/bookings/guest", json=payload)

    async def create_payment_link(self, amount_cents: int, description: str,
                                  phone: str, booking_id: Optional[str] = None) -> Any:
        body = {"amountCents": amount_cents, "description": description, "phone": phone}
        if booking_id:
            body["bookingId"] = booking_id
        return await self._request("POST", "/api/voice/payment-link", json=body)

    async def request_callback(self, name: str, phone: str, reason: str,
                               preferred_time: Optional[str] = None) -> Any:
        body = {"name": name, "phone": phone, "reason": reason}
        if preferred_time:
            body["preferredTime"] = preferred_time
        return await self._request("POST", "/api/voice/callback", json=body)


def _extract_message(resp: httpx.Response) -> str:
    try:
        data = resp.json()
        if isinstance(data, dict):
            return str(data.get("message") or data.get("detail") or "")
    except Exception:
        pass
    return ""
