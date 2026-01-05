from __future__ import annotations

import hashlib
import os
from pathlib import Path
from typing import List

import chromadb
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from openai import AsyncOpenAI, OpenAI, OpenAIError


OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_EMBED_MODEL = os.getenv("OPENAI_EMBED_MODEL", "text-embedding-3-small")
DATA_DIR = Path(__file__).resolve().parent / "data"
CHROMA_DIR = Path(__file__).resolve().parent / "chroma"
COLLECTION_NAME = "kidz4fun_rag"

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
sync_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

CHROMA_DIR.mkdir(parents=True, exist_ok=True)
vector_client = chromadb.PersistentClient(path=str(CHROMA_DIR))


def get_rag_collection() -> chromadb.api.models.Collection.Collection:
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

app = FastAPI(title="Kidz 4 Fun Chatbot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("CHATBOT_ALLOWED_ORIGIN", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant|system)$")
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]


class ChatResponse(BaseModel):
    reply: str


def chunk_text(text: str, chunk_size: int = 800, overlap: int = 150) -> List[str]:
    if not text:
        return []
    slices: List[str] = []
    start = 0
    length = len(text)
    while start < length:
        end = min(length, start + chunk_size)
        chunk = text[start:end].strip()
        if chunk:
            slices.append(chunk)
        if end == length:
            break
        start = max(end - overlap, start + 1)
    return slices


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
        # We don't raise here to keep the service available even if ingestion fails.
        print(f"[chatbot] Warning: failed to ingest documents: {error}")


@app.post("/chat", response_model=ChatResponse)
async def create_chat_completion(payload: ChatRequest) -> ChatResponse:
    if not payload.messages:
        raise HTTPException(status_code=400, detail="At least one message is required.")

    knowledge_snippets: List[str] = []
    if collection.count() > 0:
        query_embedding = embed_texts([payload.messages[-1].content])[0]
        query = collection.query(
            query_embeddings=[query_embedding],
            n_results=3,
        )
        matches = query.get("documents", [])
        if matches:
            knowledge_snippets = matches[0]

    context_block = "\n\n".join(knowledge_snippets)
    augmented_messages = payload.messages.copy()
    if context_block:
        augmented_messages.insert(
            -1,
            ChatMessage(
                role="assistant",
                content=f"Relevant reference information:\n{context_block}",
            ),
        )

    try:
        response = await client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[message.model_dump() for message in augmented_messages],
            temperature=0.5,
        )
    except OpenAIError as openai_error:
        raise HTTPException(status_code=502, detail=str(openai_error)) from openai_error
    except Exception as error:
        raise HTTPException(status_code=500, detail="Unexpected error talking to OpenAI.") from error

    try:
        content = response.choices[0].message.content or ""
    except (AttributeError, IndexError):
        raise HTTPException(status_code=500, detail="Malformed response from OpenAI.")

    return ChatResponse(reply=content.strip())


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "chatbot"}


@app.get("/")
async def root():
    """Root endpoint"""
    return {"message": "PlayFunia Chatbot API", "docs": "/docs"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
