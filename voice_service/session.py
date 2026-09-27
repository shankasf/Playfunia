"""Drive one realtime session for an accepted SIP call — with full observability.

Responsibility: attach the OpenAI Agents SDK realtime session to an accepted
call, hand it the per-call agent graph, pump the event loop, and log every
meaningful thing that happens (agent turns, handoffs, tool calls + latency,
caller/assistant transcripts, barge-ins, errors, token usage/cost) plus a single
end-of-call SUMMARY line.

What we log per call (see research: full transcript, every tool call, per-turn
latency, token usage/cost, handoffs):
  • session.start / session.end (+ duration)
  • agent.start / agent.end / handoff
  • tool.start / tool.end (name, args, output, latency_ms)
  • transcript.user / transcript.assistant (gated by VOICE_LOG_TRANSCRIPTS)
  • barge_in (caller interrupted the assistant) + time-to-first-audio per turn
  • usage (tokens split text/audio/cached) and an estimated USD cost
  • error / guardrail_tripped
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

from agents.realtime import RealtimeRunner
from agents.realtime.model_inputs import RealtimeModelSendRawMessage
from agents.realtime.openai_realtime import OpenAIRealtimeSIPModel

from backend_client import BackendClient
from config import settings
from context import CallContext
from logging_setup import bind_call, clip, mask_phone
from voice_agents import build_agent_graph

log = logging.getLogger("playfunia.voice.session")

# Rough per-1M-token audio pricing (USD) for cost estimation in logs. Update if
# OpenAI pricing changes; used only for the logged cost estimate, not billing.
_PRICING = {
    "gpt-realtime-mini": {"in_text": 0.60, "out_text": 2.40, "in_audio": 10.0,
                          "cached_audio": 0.30, "out_audio": 20.0},
    "gpt-realtime-2":    {"in_text": 4.0, "out_text": 24.0, "in_audio": 32.0,
                          "cached_audio": 0.40, "out_audio": 64.0},
    "gpt-realtime":      {"in_text": 4.0, "out_text": 16.0, "in_audio": 32.0,
                          "cached_audio": 0.40, "out_audio": 64.0},
}


@dataclass
class CallStats:
    t0: float = field(default_factory=time.monotonic)
    user_turns: int = 0
    assistant_turns: int = 0
    tool_calls: int = 0
    handoffs: int = 0
    barge_ins: int = 0
    errors: int = 0
    in_text: int = 0
    out_text: int = 0
    in_audio: int = 0
    out_audio: int = 0
    cached_audio: int = 0
    ttfa_ms: list = field(default_factory=list)        # time-to-first-audio per turn
    agents_seen: set = field(default_factory=set)
    tools_used: dict = field(default_factory=dict)     # name -> count
    assistant_buf: list = field(default_factory=list)  # streaming assistant transcript
    speech_started: int = 0                            # caller speech detections (VAD)

    def est_cost_usd(self, model: str) -> float:
        p = _PRICING.get(model) or _PRICING["gpt-realtime-mini"]
        m = 1_000_000
        return round(
            self.in_text / m * p["in_text"]
            + self.out_text / m * p["out_text"]
            + self.in_audio / m * p["in_audio"]
            + self.cached_audio / m * p["cached_audio"]
            + self.out_audio / m * p["out_audio"],
            5,
        )


def _runner_config() -> dict:
    # Minimal, per the standard SIP flow. The audio (codec, VAD, voice) is owned
    # entirely by accept_call(); we do NOT re-send an audio session.update here,
    # which was disrupting the inbound audio pipeline. Also must NOT set
    # "model_name" — the SDK rejects call_id + model_name together.
    return {"model_settings": {"tool_choice": "auto"}}


def _item_text(item) -> tuple[str | None, str | None]:
    """Best-effort (role, text) from a history item."""
    role = getattr(item, "role", None)
    parts = getattr(item, "content", None) or []
    chunks = []
    for p in parts if isinstance(parts, list) else [parts]:
        for attr in ("transcript", "text"):
            v = getattr(p, attr, None) if not isinstance(p, dict) else p.get(attr)
            if v:
                chunks.append(v)
    return role, (" ".join(chunks) if chunks else None)


def _accumulate_usage(stats: CallStats, data) -> dict | None:
    """Pull token usage from a response.done raw model event."""
    resp = getattr(data, "response", None) or (data.get("response") if isinstance(data, dict) else None)
    usage = getattr(resp, "usage", None) or (resp.get("usage") if isinstance(resp, dict) else None) if resp else None
    if not usage:
        return None

    def g(o, k):
        return getattr(o, k, None) if not isinstance(o, dict) else o.get(k)

    it = g(usage, "input_token_details") or {}
    ot = g(usage, "output_token_details") or {}
    in_audio = g(it, "audio_tokens") or 0
    in_text = g(it, "text_tokens") or 0
    cached = g(it, "cached_tokens") or 0
    out_audio = g(ot, "audio_tokens") or 0
    out_text = g(ot, "text_tokens") or 0
    stats.in_audio += in_audio
    stats.in_text += in_text
    stats.cached_audio += cached
    stats.out_audio += out_audio
    stats.out_text += out_text
    return {"in_audio": in_audio, "in_text": in_text, "cached": cached,
            "out_audio": out_audio, "out_text": out_text,
            "total": g(usage, "total_tokens")}


async def handle_call(call_id: str, caller_phone: str | None) -> None:
    bind_call(call_id)
    backend = BackendClient(settings.backend_base_url, settings.backend_secret)
    ctx = CallContext(call_id=call_id, caller_phone=caller_phone, backend=backend)
    starting_agent = build_agent_graph(ctx)
    stats = CallStats()
    tool_t0: dict[str, float] = {}
    last_speech_stop: dict[str, float] = {}

    log.info("session.start", extra={"event": "session.start",
                                     "caller": mask_phone(caller_phone),
                                     "model": settings.realtime_model,
                                     "voice": settings.voice,
                                     "audio_format": settings.audio_format})

    runner = RealtimeRunner(
        starting_agent=starting_agent,
        model=OpenAIRealtimeSIPModel(),
        config=_runner_config(),
    )

    try:
        async with await runner.run(model_config={"call_id": call_id}) as session:
            # Realtime agents do NOT speak first — per OpenAI's SIP docs we must
            # send response.create after attaching so the assistant greets the
            # caller (otherwise both sides sit in silence). Bare response.create
            # uses the active agent's (Triage) instructions, which say to greet.
            try:
                await session.model.send_event(RealtimeModelSendRawMessage(message={
                    "type": "response.create",
                    "other_data": {"response": {"instructions": (
                        f"Greet the caller warmly: introduce yourself as the "
                        f"{settings.store_name} AI assistant, briefly mention you can "
                        "help with pricing, tickets, party bookings, memberships, "
                        "events, and hours, then ask how you can help today. Keep it "
                        "to one or two short, natural sentences.")}},
                }))
                log.info("greeting.triggered", extra={"event": "greeting.triggered"})
            except Exception:
                log.exception("greeting.failed", extra={"event": "greeting.failed"})

            async for event in session:
                try:
                    _handle_event(event, stats, tool_t0, last_speech_stop)
                except Exception:
                    log.exception("log handler error", extra={"event": "log.error"})
    except Exception:
        stats.errors += 1
        log.exception("session.failed", extra={"event": "session.failed"})
    finally:
        dur = round(time.monotonic() - stats.t0, 2)
        avg_ttfa = round(sum(stats.ttfa_ms) / len(stats.ttfa_ms)) if stats.ttfa_ms else None
        log.info("session.end", extra={
            "event": "session.end",
            "duration_s": dur,
            "user_turns": stats.user_turns,
            "assistant_turns": stats.assistant_turns,
            "tool_calls": stats.tool_calls,
            "tools_used": stats.tools_used,
            "handoffs": stats.handoffs,
            "barge_ins": stats.barge_ins,
            "errors": stats.errors,
            "agents": sorted(stats.agents_seen),
            "avg_time_to_first_audio_ms": avg_ttfa,
            "tokens": {"in_text": stats.in_text, "out_text": stats.out_text,
                       "in_audio": stats.in_audio, "out_audio": stats.out_audio,
                       "cached_audio": stats.cached_audio},
            "est_cost_usd": stats.est_cost_usd(settings.realtime_model),
            "booking_id": ctx.booking_id,
        })


def _handle_event(event, stats: CallStats, tool_t0: dict, last_speech_stop: dict) -> None:
    et = getattr(event, "type", None)

    if et == "agent_start":
        name = getattr(getattr(event, "agent", None), "name", "?")
        stats.agents_seen.add(name)
        log.info("agent.start", extra={"event": "agent.start", "agent": name})

    elif et == "agent_end":
        name = getattr(getattr(event, "agent", None), "name", "?")
        log.info("agent.end", extra={"event": "agent.end", "agent": name})

    elif et == "handoff":
        frm = getattr(getattr(event, "from_agent", None), "name", "?")
        to = getattr(getattr(event, "to_agent", None), "name", "?")
        stats.handoffs += 1
        log.info("handoff", extra={"event": "handoff", "from": frm, "to": to})

    elif et == "tool_start":
        name = _tool_name(getattr(event, "tool", None))
        tool_t0[name] = time.monotonic()
        log.info("tool.start", extra={"event": "tool.start", "tool": name,
                                      "args": clip(getattr(event, "arguments", None), 300)})

    elif et == "tool_end":
        name = _tool_name(getattr(event, "tool", None))
        started = tool_t0.pop(name, None)
        latency = round((time.monotonic() - started) * 1000) if started else None
        stats.tool_calls += 1
        stats.tools_used[name] = stats.tools_used.get(name, 0) + 1
        log.info("tool.end", extra={"event": "tool.end", "tool": name,
                                    "latency_ms": latency,
                                    "output": clip(getattr(event, "output", None), 400)})

    elif et == "tool_approval_required":
        log.warning("tool.approval_required", extra={
            "event": "tool.approval_required",
            "tool": _tool_name(getattr(event, "tool", None)),
            "args": clip(getattr(event, "arguments", None), 300)})

    elif et == "audio_interrupted":
        stats.barge_ins += 1
        log.info("barge_in", extra={"event": "barge_in"})

    elif et == "error":
        stats.errors += 1
        log.error("realtime.error", extra={"event": "error",
                                           "detail": clip(getattr(event, "error", None), 500)})

    elif et == "guardrail_tripped":
        log.warning("guardrail.tripped", extra={
            "event": "guardrail.tripped",
            "message": clip(getattr(event, "message", None), 300)})

    elif et == "history_added":
        role, text = _item_text(getattr(event, "item", None))
        if role == "user":
            stats.user_turns += 1
        elif role == "assistant":
            stats.assistant_turns += 1
        if text and settings.log_transcripts:
            log.info("transcript", extra={"event": f"transcript.{role or 'unknown'}",
                                          "role": role, "text": clip(text, 1000)})

    elif et == "raw_model_event":
        _handle_raw(event, stats, last_speech_stop)


# Raw OpenAI server-event types that fire every few ms — never log individually.
_NOISY_OA = {
    "response.output_audio.delta", "response.audio.delta",
    "response.output_audio_transcript.delta", "response.audio_transcript.delta",
    "response.text.delta", "response.output_text.delta",
    "input_audio_buffer.append", "output_audio_buffer.append",
}


def _get(o, k):
    return getattr(o, k, None) if not isinstance(o, dict) else o.get(k)


def _flush_assistant(stats: CallStats) -> None:
    if stats.assistant_buf and settings.log_transcripts:
        text = "".join(stats.assistant_buf).strip()
        if text:
            log.info("transcript.assistant", extra={"event": "transcript.assistant",
                                                    "role": "assistant", "text": clip(text, 1000)})
    stats.assistant_buf.clear()


def _handle_raw(event, stats: CallStats, last_speech_stop: dict) -> None:
    """event is a RealtimeRawModelEvent; event.data is the SDK model event whose
    .type is the SDK taxonomy. For 'raw_server_event' we unwrap event.data.data to
    reach the actual OpenAI server event (session.updated, speech_started, etc.)."""
    data = getattr(event, "data", None)
    dtype = _get(data, "type")
    if not dtype:
        return

    # --- SDK-level model events ------------------------------------------------
    if dtype == "exception":
        stats.errors += 1
        log.error("realtime.exception", extra={
            "event": "realtime.exception",
            "exception": clip(repr(_get(data, "exception")), 600),
            "context": clip(_get(data, "context"), 300)})
        return
    if dtype == "error":
        stats.errors += 1
        log.error("realtime.model_error", extra={"event": "realtime.error",
                                                 "detail": clip(_get(data, "error"), 600)})
        return
    if dtype == "transcript_delta":               # assistant speech, streaming
        d = _get(data, "delta")
        if d:
            stats.assistant_buf.append(str(d))
        return
    if dtype in ("audio_done", "turn_ended"):
        _flush_assistant(stats)
        log.info("realtime", extra={"event": "realtime", "raw_type": dtype})
        return
    if dtype == "input_audio_transcription_completed":   # caller speech transcribed
        stats.user_turns += 1
        tr = _get(data, "transcript")
        if tr and settings.log_transcripts:
            log.info("transcript.user", extra={"event": "transcript.user",
                                               "role": "user", "text": clip(tr, 1000)})
        return
    if dtype == "input_audio_timeout_triggered":
        log.info("input_audio_timeout", extra={"event": "input_audio_timeout"})
        return

    # --- unwrap the actual OpenAI server event ---------------------------------
    if dtype == "raw_server_event":
        inner = _get(data, "data")
        itype = _get(inner, "type")
        if not itype or itype in _NOISY_OA:
            return

        if itype == "error":
            stats.errors += 1
            log.error("openai.error", extra={"event": "openai.error",
                                             "detail": clip(_get(inner, "error"), 800)})
            return
        if itype == "input_audio_buffer.speech_started":
            stats.speech_started += 1
            log.info("caller.speech_started", extra={"event": "caller.speech_started"})
            return
        if itype == "input_audio_buffer.speech_stopped":
            last_speech_stop["t"] = time.monotonic()
            log.info("caller.speech_stopped", extra={"event": "caller.speech_stopped"})
            return
        if itype == "session.updated":
            sess = _get(inner, "session") or {}
            audio = _get(sess, "audio") or {}
            inp = _get(audio, "input") or {}
            log.info("openai.session_updated", extra={
                "event": "openai.session_updated",
                "turn_detection": _get(inp, "turn_detection"),
                "input_format": _get(inp, "format"),
                "transcription": _get(inp, "transcription")})
            return
        if itype == "response.done":
            u = _accumulate_usage(stats, inner)
            log.info("openai.response_done", extra={"event": "openai.response_done", **(u or {})})
            return
        # everything else meaningful (session.created, rate_limits.updated,
        # response.created, conversation.item.created, ...) — log the type.
        log.info("openai", extra={"event": "openai", "oa_type": itype})
        return

    # other SDK model events (turn_started, item_updated, audio, ...)
    if dtype not in _NOISY_OA:
        log.info("realtime", extra={"event": "realtime", "raw_type": dtype})


def _tool_name(tool) -> str:
    if tool is None:
        return "?"
    return getattr(tool, "name", None) or (tool if isinstance(tool, str) else str(tool))
