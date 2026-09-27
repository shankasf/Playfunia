"""Per-call context.

One CallContext is built per inbound phone call and closed over by that call's
tools (see tools/*.py factories). Holding caller-scoped state here — rather than
in module globals — is what lets many concurrent calls run in one process
without leaking each other's phone numbers or hold state. (Dependency Inversion:
tools depend on this small object, not on global singletons.)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from backend_client import BackendClient


@dataclass
class CallContext:
    call_id: str
    caller_phone: Optional[str]          # E.164 from the SIP "From" header, if present
    backend: BackendClient

    # Mutable scratch state the agents/tools update during the call.
    booking_id: Optional[str] = field(default=None)
    customer_name: Optional[str] = field(default=None)
