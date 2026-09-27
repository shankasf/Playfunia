# Playfunia Voice Service

A multi-agent **realtime voice** phone assistant for Playfunia, built on the
**OpenAI Agents SDK (realtime)** and connected to the PSTN via **Twilio Elastic
SIP Trunking → OpenAI Realtime (SIP)**. It handles customer queries, party
bookings, deposit payments (by secure SMS link), and human handoff.

## Architecture

```
Caller ──PSTN──► Twilio Elastic SIP Trunk ──SIP/TLS──► sip:proj_<id>@sip.api.openai.com
                                                              │
                       OpenAI ──webhook: realtime.call.incoming──► POST /webhook (this service)
                                                              │
        this service ──REST accept + Agents SDK control WS──► drives agents / handoffs / tools
```

Audio never transits this service (SIP terminates at OpenAI), so it is a thin
control plane. The agents call tools that delegate to the Playfunia backend and
chatbot — no business logic is duplicated here (SOLID / DRY).

### Agents (single RealtimeSession; handoffs preserve audio + history)

| Agent | Responsibility | Tools |
|-------|----------------|-------|
| **Triage** | Greet, detect intent, route. Holds the shared persona. | — (handoffs only) |
| **Info** | FAQ: hours, pricing, packages, policies. | `ask_playfunia` → chatbot `/chat` |
| **Booking** | Availability, price estimate, create party. | backend `/api/bookings/*` |
| **Payments** | Text a secure Square deposit link. | backend `/api/voice/payment-link` |
| **Escalation** | Warm transfer to staff, or take a callback. | OpenAI SIP REFER, backend `/api/voice/callback` |

### Why these choices
- **Model is session-level.** Default `gpt-realtime-mini` (~$0.05–0.10/min with
  caching). Set `VOICE_REALTIME_MODEL=gpt-realtime-2` for heavier reasoning.
- **Short, scoped prompts.** The shared persona lives only on Triage; each
  specialist carries a tiny instruction + a minimal tool set, so per-turn input
  tokens stay low.
- **No card data by voice.** Payments are taken via a Square-hosted link texted
  to the caller — PCI handling stays inside the backend's existing Square flow.

## Configuration (env vars, read from the repo-root `.env`)

| Var | Required | Default | Purpose |
|-----|----------|---------|---------|
| `OPENAI_API_KEY` | ✅ | — | Realtime + accept/refer REST |
| `OPENAI_WEBHOOK_SECRET` | ✅ (prod) | — | Verify `realtime.call.incoming` (`whsec_…`) |
| `VOICE_REALTIME_MODEL` | | `gpt-realtime-mini` | Realtime model (session-level) |
| `VOICE_TTS_VOICE` | | `ash` | Voice (locked once the agent speaks) |
| `VOICE_AUDIO_FORMAT` | | `audio/pcmu` | G.711 µ-law for telephony |
| `VOICE_BACKEND_URL` | | `http://backend:5000` | Backend base URL |
| `VOICE_BACKEND_SECRET` | ✅ | — | Shared secret for `/api/voice/*` (also set on backend) |
| `VOICE_CHATBOT_URL` | | `http://chatbot:8000` | Chatbot `/chat` for FAQ |
| `VOICE_STORE_NAME` | | `Playfunia` | Persona |
| `VOICE_DEFAULT_LOCATION` | | `Albany` | Location for availability/booking |
| `VOICE_STAFF_PHONE` | | — | Warm-transfer / callback target (E.164) |
| `chatbot_db_password` | (inherited) | — | Read-only DB role (only if direct reads are reintroduced) |

> `VOICE_BACKEND_SECRET` and `VOICE_STAFF_PHONE` must also be visible to the
> **backend** container (they are — both load the same root `.env`).

## One-time setup

### 1. Apply DB migrations + backfill embeddings (shared with chatbot)
```bash
psql "$SUPABASE_URL" -f ../chatbot_service/migrations/001_init_pgvector_kb.sql
psql "$SUPABASE_URL" -f ../chatbot_service/migrations/002_kb_grants.sql
python ../chatbot_service/scripts/export_kb_text.py      # regenerate KB text
python ../chatbot_service/scripts/backfill_pgvector.py   # embed → pgvector (3-large @1536)
```

### 2. Connect the Twilio phone number (pick ONE)

**Option A — Voice webhook (simplest, no trunk).** In the Twilio Console open the
phone number, and under **Voice & Fax → A CALL COMES IN** set:

```
Webhook:  https://<public-host>/twiml/incoming      (HTTP POST)
```

That endpoint (served by this service, route it through Caddy) returns TwiML that
dials the call into OpenAI's SIP endpoint. Requires `OPENAI_PROJECT_ID` in `.env`
(the URL it dials is `sip:proj_<id>@sip.api.openai.com;transport=tls`).

**Option B — Elastic SIP Trunk.** Create a trunk, set its **Origination URI** to
`sip:proj_<YOUR_PROJECT_ID>@sip.api.openai.com;transport=tls`, and point the phone
number at the trunk. No `/twiml/incoming` needed.

Both paths end the same way: OpenAI receives the SIP call and fires
`realtime.call.incoming` to the webhook configured in step 3.

### 3. OpenAI webhook
- In the OpenAI dashboard (Project → Webhooks) add a webhook for
  `realtime.call.incoming` pointing at `https://<public-host>/webhook` (route
  the `voice` service through Caddy). Copy the signing secret into
  `OPENAI_WEBHOOK_SECRET`.

### 4. Run
```bash
docker compose -f docker/docker-compose.yml up -d voice
```

## Logging / observability

Every log line is **structured JSON** on stdout (captured by `docker logs` and
any log shipper — Loki/CloudWatch/Datadog), tagged with the active `call_id` so
all lines for one phone call correlate. Uvicorn access/error logs are routed
through the same formatter.

Per-call events logged: `webhook.incoming` → `openai.accept` / `call.accepted` →
`session.start` → `agent.start`/`agent.end`, `handoff`, `tool.start`/`tool.end`
(name, args, output, `latency_ms`), `transcript.user`/`transcript.assistant`,
`barge_in`, `usage` (token split + running cost), `backend.call`, `chatbot.ask`,
`payment.link_sent`, `escalation.transfer`/`escalation.callback`, `error`,
`guardrail.tripped` → and a final **`session.end`** summary line with duration,
turn counts, tools used, handoffs, barge-ins, avg time-to-first-audio, total
tokens, and an estimated USD cost.

Controls (env): `VOICE_LOG_LEVEL` (INFO|DEBUG), `VOICE_LOG_JSON` (true→JSON,
false→human text), `VOICE_LOG_TRANSCRIPTS` (log spoken content — PII), `VOICE_LOG_RAW_EVENTS`
(very verbose raw realtime events), `VOICE_LOG_MASK_PII` (mask phone numbers).

Watch a live call:
```bash
docker logs -f playfunia-voice | grep '"call_id"'
# pretty-print one call's events:
docker logs playfunia-voice | grep <call_id> | jq .
```

## Local checks
```bash
python -m compileall .          # syntax
curl localhost:8003/health      # liveness
```

## Notes / runtime caveats
- The `accept_call` body uses the GA realtime shape (`audio.input/output.format`
  = `{ "type": "audio/pcmu" }`). If a future API revision changes the codec
  field, adjust `openai_telephony.accept_call`.
- `OpenAIRealtimeSIPModel` (from `agents.realtime.openai_realtime`) attaches to
  the already-accepted call via `model_config={"call_id": …}`. If your installed
  `openai-agents` performs its own `accept`, drop the pre-accept in
  `main.openai_webhook`.
- `openai-agents` is pre-1.0; pin the version in `requirements.txt` and re-test
  realtime imports on upgrade.
