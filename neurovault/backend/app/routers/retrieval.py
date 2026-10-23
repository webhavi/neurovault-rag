"""Retrieval configuration and real-time retrieval tracing.

The trace endpoint performs the *actual* retrieval steps (embedding, candidate
search, MMR selection) without calling the LLM, and reports real measured
values. It never fabricates coordinates or scores.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request

from app.schemas import (
    RetrievalConfigResponse,
    TraceCandidate,
    TraceRequest,
    TraceResponse,
    TraceTimings,
)
from app.services.rag_service import PipelineError

log = logging.getLogger("neurovault.retrieval")

router = APIRouter()


@router.get("/retrieval/config", response_model=RetrievalConfigResponse)
def retrieval_config(request: Request) -> RetrievalConfigResponse:
    settings = request.app.state.settings
    return RetrievalConfigResponse(
        strategy=settings.search_type,
        k=settings.retriever_k,
        fetch_k=settings.retriever_fetch_k,
        lambda_mult=settings.retriever_lambda_mult,
        embedding_provider="HuggingFace (sentence-transformers)",
        embedding_model=settings.embedding_model,
        llm_provider="Groq" if settings.groq_api_key else "Groq (not configured)",
        llm_model=settings.groq_model,
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
    )


@router.post("/retrieval/trace", response_model=TraceResponse)
def retrieval_trace(payload: TraceRequest, request: Request) -> TraceResponse:
    rag = request.app.state.rag
    settings = request.app.state.settings
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=422, detail="Question must not be empty.")

    if rag.state.status in {"idle", "initializing"}:
        rag.wait_ready(90.0)
    if rag.state.status == "error" or rag.embeddings is None:
        return TraceResponse(
            question=question,
            status="unavailable",
            detail="The retrieval pipeline is not available. Check backend logs.",
        )
    if rag.state.vector_store_state in {"missing", "empty", "error"}:
        return TraceResponse(
            question=question,
            status="empty",
            detail="No documents are indexed yet, so there is nothing to retrieve.",
            mmr_params={
                "k": settings.retriever_k,
                "fetch_k": settings.retriever_fetch_k,
                "lambda_mult": settings.retriever_lambda_mult,
            },
        )

    try:
        data = rag.trace(question)
    except PipelineError as exc:
        log.warning("Trace failed: %s", exc)
        return TraceResponse(question=question, status="unavailable", detail=str(exc))
    except Exception:  # noqa: BLE001
        log.exception("Trace crashed")
        return TraceResponse(question=question, status="unavailable", detail="Unexpected retrieval error.")

    candidates = [TraceCandidate(**c) for c in data["candidates"]]
    return TraceResponse(
        question=question,
        status=data["status"],  # type: ignore[arg-type]
        query_embedding_dim=data.get("query_embedding_dim"),
        query_point=data.get("query_point"),
        candidates=candidates,
        context_chars=data.get("context_chars"),
        context_preview=data.get("context_preview"),
        timings=TraceTimings(**data["timings"]),
        mmr_params=data["mmr_params"],
        notes=data["notes"],
    )
