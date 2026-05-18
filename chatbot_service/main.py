"""Playfunia chatbot — FastAPI surface.

This file is intentionally thin:
  * boots FastAPI + CORS
  * runs the text-KB ingest on startup (so the semantic tool has something
    to search)
  * forwards /chat requests to the head agent (agent.run), which routes
    between the structured-data tools and the semantic search tool.
"""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
from typing import List

from dotenv import load_dotenv

ROOT_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(ROOT_ENV_PATH)

import chromadb
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel, Field

from agent import run as run_head_agent


OPENAI_EMBED_MODEL = os.getenv("OPENAI_EMBED_MODEL", "text-embedding-3-small")
DATA_DIR = Path(__file__).resolve().parent / "data"
CHROMA_DIR = Path(__file__).resolve().parent / "chroma"
COLLECTION_NAME = "kidz4fun_rag"

sync_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
CHROMA_DIR.mkdir(parents=True, exist_ok=True)
vector_client = chromadb.PersistentClient(path=str(CHROMA_DIR))


def get_rag_collection():
    try:
        coll = vector_client.get_collection(COLLECTION_NAME)
        metadata = coll.metadata or {}
        if metadata.get("embedding_model") != OPENAI_EMBED_MODEL:
            vector_client.delete_collection(COLLECTION_NAME)
            raise ValueError("Recreating collection with new embedding model.")
    except Exception:
        coll = vector_client.create_collection(
            COLLECTION_NAME,
            metadata={"embedding_model": OPENAI_EMBED_MODEL},
        )
    return coll


collection = get_rag_collection()

app = FastAPI(title="Playfunia Chatbot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("CHATBOT_ALLOWED_ORIGIN", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- request/response models ---------------------------------------------

class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant|system|tool)$")
    content: str | None = None


class ChatRequest(BaseModel):
    messages: List[ChatMessage]


class ChatResponse(BaseModel):
    reply: str


# ---------- ingest (semantic KB) ------------------------------------------------

def chunk_text(text: str, max_chars: int = 1800) -> List[str]:
    """Section-aware chunker. Splits on `## ` headers then on paragraph breaks."""
    if not text:
        return []
    sections: List[tuple[str | None, str]] = []
    current_header: str | None = None
    current_body: List[str] = []
    for line in text.splitlines():
        if line.startswith("## "):
            if current_header is not None or current_body:
                sections.append((current_header, "\n".join(current_body).strip()))
            current_header = line.rstrip()
            current_body = []
        else:
            current_body.append(line)
    if current_header is not None or current_body:
        sections.append((current_header, "\n".join(current_body).strip()))

    chunks: List[str] = []
    for header, body in sections:
        if not body and not header:
            continue
        paragraphs = [p.strip() for p in body.split("\n\n") if p.strip()]
        merged: List[str] = []
        i = 0
        while i < len(paragraphs):
            p = paragraphs[i]
            if p.startswith("### ") and "\n" not in p and i + 1 < len(paragraphs):
                merged.append(p + "\n\n" + paragraphs[i + 1])
                i += 2
            else:
                merged.append(p)
                i += 1
        paragraphs = merged or [""]
        header_prefix = (header + "\n\n") if header else ""
        for p in paragraphs:
            chunk = header_prefix + p
            while len(chunk) > max_chars:
                cut = chunk.rfind(". ", len(header_prefix), max_chars)
                if cut == -1:
                    cut = max_chars
                chunks.append(chunk[: cut + 1].strip())
                rest = chunk[cut + 1 :].strip()
                chunk = header_prefix + rest
            if chunk.strip():
                chunks.append(chunk)
    return chunks


def embed_texts(texts: List[str]) -> List[List[float]]:
    response = sync_client.embeddings.create(model=OPENAI_EMBED_MODEL, input=texts)
    return [item.embedding for item in response.data]


def ingest_documents() -> None:
    if not DATA_DIR.exists():
        return
    supported_suffixes = {".txt", ".md", ".markdown", ".json"}
    for file_path in DATA_DIR.glob("**/*"):
        if not file_path.is_file() or file_path.suffix.lower() not in supported_suffixes:
            continue
        try:
            content = file_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            content = file_path.read_text(encoding="latin-1")
        chunks = chunk_text(content)
        if not chunks:
            continue
        rel_path = str(file_path.relative_to(DATA_DIR))
        base_hash = hashlib.sha1(rel_path.encode("utf-8")).hexdigest()
        ids = [f"{base_hash}_{i}" for i in range(len(chunks))]
        embeddings = embed_texts(chunks)
        collection.delete(where={"source": rel_path})
        collection.upsert(
            ids=ids,
            documents=chunks,
            embeddings=embeddings,
            metadatas=[{"source": rel_path, "chunk": idx} for idx in range(len(chunks))],
        )


@app.on_event("startup")
async def on_startup() -> None:
    try:
        ingest_documents()
    except Exception as error:
        print(f"[chatbot] Warning: failed to ingest documents: {error}")


# ---------- chat endpoint -------------------------------------------------------

@app.post("/chat", response_model=ChatResponse)
async def create_chat_completion(payload: ChatRequest) -> ChatResponse:
    if not payload.messages:
        raise HTTPException(status_code=400, detail="At least one message is required.")

    # Strip any caller-supplied system messages — the head agent owns the system
    # prompt. Caller can only supply user/assistant turns.
    history = [
        {"role": m.role, "content": m.content or ""}
        for m in payload.messages
        if m.role in {"user", "assistant"}
    ]
    if not history:
        raise HTTPException(status_code=400, detail="No user message found.")

    result = await run_head_agent(history)
    reply = result.get("reply") or ""
    if not reply:
        raise HTTPException(status_code=500, detail="Agent returned empty reply.")
    return ChatResponse(reply=reply)


@app.post("/chat/debug")
async def chat_debug(payload: ChatRequest):
    """Same as /chat but returns the tool-call trace for debugging."""
    history = [
        {"role": m.role, "content": m.content or ""}
        for m in payload.messages
        if m.role in {"user", "assistant"}
    ]
    if not history:
        raise HTTPException(status_code=400, detail="No user message found.")
    return await run_head_agent(history)


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "chatbot"}


@app.get("/")
async def root():
    return {"message": "Playfunia Chatbot API", "docs": "/docs"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
