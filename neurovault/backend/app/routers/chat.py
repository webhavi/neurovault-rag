"""Chat endpoint: the real RAG pipeline behind an HTTP API."""
from __future__ import annotations

import logging
import time

from fastapi import APIRouter, HTTPException, Request

from app.schemas import ChatRequest, ChatResponse, RetrievalInfo, SourceRef
from app.services.rag_service import PipelineError, classify_provider_error

log = logging.getLogger("neurovault.chat")

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
def chat(payload: ChatRequest, request: Request) -> ChatResponse:
    rag = request.app.state.rag
    settings = request.app.state.settings
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=422, detail="Question must not be empty.")

    # Wait for (optional) background initialization, then verify readiness.
    if rag.state.status in {"idle", "initializing"}:
        rag.wait_ready(min(settings.chat_wait_ready_s, 90.0))

    state = rag.state
    if state.status == "error":
        raise HTTPException(
            status_code=503,
            detail={
                "code": "pipeline_unavailable",
                "message": f"The RAG pipeline failed to initialize: {state.detail or 'unknown error'}",
            },
        )
    byok = payload.byok_api_key or request.headers.get("x-groq-api-key")
    if byok:
        byok = byok.strip()
        if byok == "gsk_your_groq_api_key_here":
            byok = None

    if not state.llm_configured and not byok:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "provider_not_configured",
                "message": "Chat answers are unavailable because GROQ_API_KEY is not configured "
                "on the server or provided in Settings (BYOK). Set it in Settings or backend .env file.",
            },
        )
    if state.vector_store_state in {"missing", "empty", "error"}:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "empty_vector_store",
                "message": "No documents are indexed yet. Open the Knowledge Library and "
                "ingest a source before asking questions.",
            },
        )

    started = time.perf_counter()
    try:
        result = rag.answer(question, byok_key=byok)
    except PipelineError as exc:
        raise HTTPException(status_code=503, detail={"code": "empty_retrieval", "message": str(exc)}) from exc
    except Exception as exc:  # noqa: BLE001 - classified below
        log.exception("Chat pipeline failed")
        status, code, message = classify_provider_error(exc)
        raise HTTPException(status_code=status, detail={"code": code, "message": message}) from exc

    total_ms = int((time.perf_counter() - started) * 1000)
    grounded = "couldn't find that in the indexed documents" not in result.answer.lower()

    return ChatResponse(
        answer=result.answer,
        sources=[SourceRef(**s) for s in result.sources],
        retrieval=RetrievalInfo(
            strategy=settings.search_type,
            chunks_retrieved=result.chunks_retrieved,
            duration_ms=result.retrieval_ms,
        ),
        metadata={
            "duration_ms": total_ms,
            "model": result.model,
            "grounded": grounded,
            "generation_ms": result.generation_ms,
        },
    )
