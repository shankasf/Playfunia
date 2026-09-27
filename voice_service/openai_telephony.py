"""Thin wrappers over OpenAI's Realtime *call* REST endpoints (SIP telephony).

Two operations the SDK session does not own:
  * accept_call  — answer an inbound SIP call with the initial session config
                   (audio codec, turn detection, voice). Called from the
                   realtime.call.incoming webhook before the SDK attaches.
  * refer_call   — warm-transfer the live call to a human (SIP REFER) by handing
                   it off to a PSTN/SIP target (the staff phone).

Kept separate from session.py so the HTTP/transport concern is isolated from the
agent-orchestration concern (Single Responsibility).

Docs: https://developers.openai.com/api/docs/guides/realtime-sip
"""
from __future__ import annotations

import logging

import httpx

from config import settings

log = logging.getLogger("playfunia.voice.telephony")

_API = "https://api.openai.com/v1/realtime/calls"


def _auth() -> dict:
    return {"Authorization": f"Bearer {settings.openai_api_key}",
            "Content-Type": "application/json"}


async def accept_call(call_id: str) -> None:
    """Answer the inbound SIP call with the initial realtime session config.

    Only sets the transport-level audio + turn detection. The agent's
    instructions/tools/handoffs are pushed afterwards by the SDK session
    (session.py), so they live in exactly one place.
    """
    # Standard SIP accept body (per https://developers.openai.com/api/docs/guides/
    # realtime-sip): type + model + instructions, voice under audio.output.voice.
    # We deliberately do NOT set audio input format / turn_detection / transcription
    # — for SIP, OpenAI auto-negotiates the G.711 codec and applies default server
    # VAD. Forcing those broke inbound (caller) audio.
    body = {
        "type": "realtime",
        "model": settings.realtime_model,
        "instructions": (
            f"You are the {settings.store_name} AI assistant — the official phone "
            f"assistant for {settings.store_name}, an indoor children's play center. "
            f"Always identify yourself as the {settings.store_name} AI assistant. "
            "Greet the caller warmly and help them."
        ),
        "audio": {"output": {"voice": settings.voice}},
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(f"{_API}/{call_id}/accept", headers=_auth(), json=body)
    if resp.status_code >= 400:
        log.error("call.accept_failed", extra={"event": "openai.accept", "ok": False,
                                               "status": resp.status_code,
                                               "detail": resp.text[:300]})
        resp.raise_for_status()
    log.info("openai.accept", extra={"event": "openai.accept", "ok": True,
                                     "model": settings.realtime_model})


async def refer_call(call_id: str, target_uri: str) -> bool:
    """Warm-transfer (SIP REFER) the call to `target_uri` (e.g. 'tel:+15551234567').

    Returns True if OpenAI accepted the REFER. The call leaves our control once
    transferred, so the agent should say goodbye right before invoking this.
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{_API}/{call_id}/refer", headers=_auth(), json={"target_uri": target_uri}
        )
    if resp.status_code >= 400:
        log.warning("openai.refer_failed", extra={"event": "openai.refer", "ok": False,
                                                  "target": target_uri,
                                                  "status": resp.status_code,
                                                  "detail": resp.text[:300]})
        return False
    log.info("openai.refer", extra={"event": "openai.refer", "ok": True, "target": target_uri})
    return True
