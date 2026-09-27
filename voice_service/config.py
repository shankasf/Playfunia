"""Centralised configuration for the Playfunia voice service.

Single source of truth for env-driven settings (Single Responsibility). Every
other module imports `settings` rather than reading os.environ directly, so the
configuration surface is auditable in one place and trivially mockable in tests.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


@dataclass(frozen=True)
class Settings:
    # --- OpenAI / realtime ---------------------------------------------------
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    # Model is SESSION-level: it cannot change mid-call across handoffs. Default
    # to the cheaper mini for FAQ/booking/routing (~$0.05-0.10/min w/ caching);
    # set VOICE_REALTIME_MODEL=gpt-realtime-2 for heavier reasoning.
    realtime_model: str = os.getenv("VOICE_REALTIME_MODEL", "gpt-realtime-mini")
    # Voice is locked once any agent has spoken — all agents share it.
    voice: str = os.getenv("VOICE_TTS_VOICE", "ash")
    # Telephony audio is G.711 µ-law 8 kHz. GA realtime calls this "audio/pcmu".
    audio_format: str = os.getenv("VOICE_AUDIO_FORMAT", "audio/pcmu")
    transcribe_model: str = os.getenv("VOICE_TRANSCRIBE_MODEL", "gpt-4o-mini-transcribe")

    # OpenAI webhook signing secret (whsec_...) for realtime.call.incoming.
    openai_webhook_secret: str = os.getenv("OPENAI_WEBHOOK_SECRET", "")

    # OpenAI project id for the SIP URI. Deliberately NOT named OPENAI_PROJECT_ID
    # (the OpenAI SDK auto-reads that and sends a project header that a
    # service-account key 401s on). Or override the whole URI with OPENAI_SIP_URI.
    openai_project_id: str = os.getenv("OPENAI_REALTIME_PROJECT_ID", "")
    openai_sip_uri: str = os.getenv("OPENAI_SIP_URI", "")

    @property
    def sip_uri(self) -> str:
        if self.openai_sip_uri:
            return self.openai_sip_uri
        pid = self.openai_project_id
        if not pid:
            return ""
        # Dashboard project ids are already `proj_...`; only add the prefix if a
        # bare id was supplied. Avoids the doubled `proj_proj_` bug.
        if not pid.startswith("proj_"):
            pid = f"proj_{pid}"
        return f"sip:{pid}@sip.api.openai.com;transport=tls"

    # --- Backend (transactional API the tools call) --------------------------
    backend_base_url: str = os.getenv("VOICE_BACKEND_URL", "http://backend:5000")
    # Shared secret sent as X-Voice-Secret so the backend's /api/voice/* routes
    # trust this server-to-server caller without a user session.
    backend_secret: str = os.getenv("VOICE_BACKEND_SECRET", "")

    # Existing chatbot service — the info agent delegates FAQ/info questions here
    # rather than re-implementing the 24 structured tools + pgvector search.
    chatbot_url: str = os.getenv("VOICE_CHATBOT_URL", "http://chatbot:8000")

    # --- Observability / logging --------------------------------------------
    log_level: str = os.getenv("VOICE_LOG_LEVEL", "INFO").upper()
    log_json: bool = os.getenv("VOICE_LOG_JSON", "true").lower() == "true"
    # Log spoken content (caller + assistant transcripts). On by default for full
    # call auditing; set false to keep transcripts out of logs (PII).
    log_transcripts: bool = os.getenv("VOICE_LOG_TRANSCRIPTS", "true").lower() == "true"
    # Log raw realtime model events (very verbose; useful for deep debugging).
    log_raw_events: bool = os.getenv("VOICE_LOG_RAW_EVENTS", "false").lower() == "true"
    # Mask phone numbers to last 4 digits in logs.
    mask_pii: bool = os.getenv("VOICE_LOG_MASK_PII", "true").lower() == "true"

    # --- Business / handoff --------------------------------------------------
    store_name: str = os.getenv("VOICE_STORE_NAME", "Playfunia")
    # The Twilio number callers dial to reach the AI (point it at /twiml/incoming).
    ai_phone_number: str = os.getenv("VOICE_AI_PHONE_NUMBER", "")
    # Default location used for availability/booking when the single-site caller
    # doesn't specify one (the booking endpoints require a location string).
    default_location: str = os.getenv("VOICE_DEFAULT_LOCATION", "Albany")
    staff_phone: str = os.getenv("VOICE_STAFF_PHONE", "")  # warm-transfer target

    def require(self, *names: str) -> None:
        missing = [n for n in names if not getattr(self, n, None)]
        if missing:
            raise RuntimeError(f"Missing required config: {', '.join(missing)}")


settings = Settings()
