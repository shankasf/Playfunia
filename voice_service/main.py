"""Playfunia voice service — FastAPI surface.

One job: receive OpenAI's `realtime.call.incoming` webhook for an inbound SIP
call, accept the call, and spawn the realtime agent session. Audio never flows
through this server (SIP terminates at OpenAI), so this stays a thin control
plane.

Telephony path:
  Twilio Elastic SIP Trunk --(SIP/TLS)--> sip:proj_<id>@sip.api.openai.com
  OpenAI --(webhook: realtime.call.incoming)--> POST /webhook (this service)
  this service --(REST accept + SDK control WS)--> drives agents/handoffs/tools
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import logging

from fastapi import FastAPI, Request, Response

import logging_setup
from config import settings
from logging_setup import bind_call, mask_phone
from openai_telephony import accept_call
from session import handle_call

logging_setup.configure()
log = logging.getLogger("playfunia.voice")

app = FastAPI(title="Playfunia Voice Service")


# --------------------------------------------------------------------------- #
# OpenAI webhook signature (Standard Webhooks scheme)
# Headers: webhook-id, webhook-timestamp, webhook-signature ("v1,<base64>")
# Signed content: f"{id}.{timestamp}.{raw_body}", HMAC-SHA256 with the secret
# bytes (the part after the "whsec_" prefix, base64-decoded).
# --------------------------------------------------------------------------- #
def _verify_signature(headers, raw_body: bytes) -> bool:
    secret = settings.openai_webhook_secret
    if not secret:
        log.warning("OPENAI_WEBHOOK_SECRET unset — skipping signature verification")
        return True
    wid = headers.get("webhook-id")
    ts = headers.get("webhook-timestamp")
    sig_header = headers.get("webhook-signature")
    if not (wid and ts and sig_header):
        return False
    key = secret[len("whsec_"):] if secret.startswith("whsec_") else secret
    try:
        key_bytes = base64.b64decode(key)
    except Exception:
        key_bytes = key.encode()
    signed = f"{wid}.{ts}.{raw_body.decode()}".encode()
    expected = base64.b64encode(hmac.new(key_bytes, signed, hashlib.sha256).digest()).decode()
    # The header may carry several space-separated "v1,<sig>" tokens.
    for token in sig_header.split():
        _, _, provided = token.partition(",")
        if provided and hmac.compare_digest(provided, expected):
            return True
    return False


def _caller_phone_from_sip(data: dict) -> str | None:
    """Best-effort extraction of the caller's number from SIP headers.

    sip_headers is a list of {name, value}; the From header looks like
    '"Caller" <sip:+15551234567@host>;tag=...'. Pull the +E.164 user part.
    """
    headers = data.get("sip_headers") or []
    from_val = None
    for h in headers:
        if (h.get("name") or "").lower() == "from":
            from_val = h.get("value")
            break
    if not from_val:
        return None
    import re
    m = re.search(r"[<:](\+?\d{7,15})@", from_val)
    return m.group(1) if m else None


@app.post("/webhook")
async def openai_webhook(request: Request) -> Response:
    raw = await request.body()
    if not _verify_signature(request.headers, raw):
        log.warning("webhook.rejected", extra={"event": "webhook.rejected",
                                               "reason": "bad_signature"})
        return Response(status_code=401, content="invalid signature")

    try:
        event = json.loads(raw)
    except json.JSONDecodeError:
        log.warning("webhook.bad_json", extra={"event": "webhook.bad_json"})
        return Response(status_code=400, content="invalid json")

    etype = event.get("type")
    if etype != "realtime.call.incoming":
        log.info("webhook.ignored", extra={"event": "webhook.ignored", "type": etype})
        return Response(status_code=200, content="ignored")

    data = event.get("data") or {}
    call_id = data.get("call_id")
    if not call_id:
        log.warning("webhook.missing_call_id", extra={"event": "webhook.missing_call_id"})
        return Response(status_code=400, content="missing call_id")

    bind_call(call_id)
    caller_phone = _caller_phone_from_sip(data)
    log.info("webhook.incoming", extra={"event": "webhook.incoming",
                                        "caller": mask_phone(caller_phone)})

    # Answer the call, then drive the session in the background so we return the
    # webhook 200 promptly (OpenAI expects a fast ack).
    try:
        await accept_call(call_id)
    except Exception:
        log.exception("call.accept_failed", extra={"event": "call.accept_failed"})
        return Response(status_code=502, content="accept failed")

    asyncio.create_task(handle_call(call_id, caller_phone))
    log.info("call.accepted", extra={"event": "call.accepted"})
    return Response(status_code=200, content="accepted")


@app.api_route("/twiml/incoming", methods=["GET", "POST"])
async def twilio_incoming(_request: Request) -> Response:
    """Twilio Voice webhook for the phone number.

    Set this URL as the number's "A CALL COMES IN" webhook in the Twilio Console
    (HTTP POST). It returns TwiML that dials the call into OpenAI's Realtime SIP
    endpoint, which then fires `realtime.call.incoming` to /webhook above. This
    is the alternative to configuring an Elastic SIP Trunk — pick one, not both.
    """
    log.info("twiml.incoming", extra={"event": "twiml.incoming"})
    sip_uri = settings.sip_uri
    if not sip_uri:
        log.error("twiml.no_sip_uri", extra={"event": "twiml.no_sip_uri"})
        twiml = ('<?xml version="1.0" encoding="UTF-8"?><Response>'
                 '<Say>Sorry, the assistant is not available right now.</Say>'
                 '<Hangup/></Response>')
        return Response(content=twiml, media_type="application/xml", status_code=200)

    twiml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<Response><Dial answerOnBridge="true">'
        f'<Sip>{sip_uri}</Sip>'
        '</Dial></Response>'
    )
    return Response(content=twiml, media_type="application/xml")


@app.get("/health")
async def health() -> dict:
    return {"status": "healthy", "service": "voice"}


@app.get("/")
async def root() -> dict:
    return {"message": "Playfunia Voice Service", "model": settings.realtime_model}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
