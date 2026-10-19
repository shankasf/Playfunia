# Kidz 4 Fun Chatbot Service

This FastAPI microservice brokers conversation between the React frontend and OpenAI's Assistants API. It is intentionally isolated from the Node backend so you can manage API keys and rate limits independently.

## Prerequisites

- Python 3.10+
- An [OpenAI API key](https://platform.openai.com/api-keys)

## Setup

```bash
cd chatbot_service
python -m venv .venv
.venv\Scripts\activate  # Windows
# source .venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
```

Create a `.env` file next to `main.py`:

```env
OPENAI_API_KEY=sk-...
# optional overrides
OPENAI_MODEL=gpt-4o-mini
OPENAI_EMBED_MODEL=text-embedding-3-small
CHATBOT_ALLOWED_ORIGIN=http://localhost:3000
```

## Run

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

> Tip: `start-dev.bat` in the repository root now launches the chatbot alongside the React and Node servers (it will activate `chatbot_service\.venv` if present).

### Environment variables used by the frontend

Add this entry to `frontend/.env` so the React widget can reach the FastAPI instance:

```
REACT_APP_CHATBOT_API_URL=http://localhost:8000/chat
```

## API

```json
{
  "messages": [
    { "role": "system", "content": "You are a helpful assistant for Kidz 4 Fun." },
    { "role": "user", "content": "Tell me about party packages." }
  ]
}
```

Response:

```json
{ "reply": "..." }
```

### Retrieval-Augmented Generation (RAG)

- The knowledge base lives in Supabase Postgres (pgvector): `kb_documents` / `kb_chunks`, searched via the `kb_search()` SQL function (see `migrations/001_init_pgvector_kb.sql`, `002_kb_grants.sql`, and `backend/migrations/add_chatbot_settings_and_kb_admin.sql`).
- Documents are managed in the admin panel at **/admin/chatbot → Knowledge Base**: upload any file (txt, md, pdf, docx, xlsx/csv, json, html, images via vision), create/edit text documents inline, enable/disable, reindex, delete. The Node backend extracts text, chunks it, embeds it with `text-embedding-3-large` at 1536 dims and writes the rows. Only documents that are enabled and `ready` are searchable.
- This service is read-only: `semantic.py` embeds the query (same model/dims, see `embeddings.py`) and calls `kb_search()`. No restart is needed after KB changes.
- `scripts/backfill_pgvector.py` remains for one-off imports of text files from `data/`; `scripts/export_kb_text.py` regenerates `data/playfunia_knowledge_base.txt` from the business tables.

### Admin-managed runtime settings

The single row in `chatbot_settings` (edited at **/admin/chatbot → Settings**) controls: `enabled`, `model`, `temperature`, `system_prompt` (empty = built-in default in `agent.py`), `max_tool_turns`, `kb_enabled` (removes the `search_knowledge_base` tool when off), `kb_top_k`, plus widget copy (`greeting`, `quick_prompts`, `capability_phrases`). `settings.py` reads it with a 30s TTL cache, so changes apply within ~30s without a restart. `GET /settings/debug` shows the effective values and their source.

Adjust CORS by updating `CHATBOT_ALLOWED_ORIGIN` if your frontend runs on a different host.
