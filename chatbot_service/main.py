"""Playfunia chatbot — FastAPI surface.

This file is intentionally thin:
  * boots FastAPI + CORS
  * forwards /chat requests to the head agent (agent.run), which routes
    between the structured-data tools and the semantic search tool.

The semantic knowledge base now lives in pgvector (see semantic.py and
migrations/00{1,2}_*.sql). It is populated out-of-band by
scripts/backfill_pgvector.py — the service no longer ingests on startup, so
boot is fast and the running container needs no write access to the DB.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import List

from dotenv import load_dotenv

ROOT_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(ROOT_ENV_PATH)

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from agent import run as run_head_agent


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
