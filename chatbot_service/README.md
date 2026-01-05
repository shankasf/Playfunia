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

- Place reference files (currently `.txt`, `.md`, `.markdown`, `.json`) in `chatbot_service/data/`.
- A sample knowledge file (`kidz4fun.txt`) is provided as a reference format.
- On startup the service chunks and embeds those documents into a local ChromaDB store under `chatbot_service/chroma/`.
- Retrieved snippets are appended to the conversation context before querying OpenAI.

Restart the service after updating files in `data/`. Adjust CORS by updating `CHATBOT_ALLOWED_ORIGIN` if your frontend runs on a different host.
