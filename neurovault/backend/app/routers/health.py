"""Health endpoint: real availability checks, no fabricated status."""
from __future__ import annotations

import time

from fastapi import APIRouter, Request

from app.schemas import HealthCheck, HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health(request: Request) -> HealthResponse:
    rag = request.app.state.rag
    settings = request.app.state.settings
    state = rag.state

    store_ok = state.vector_store_state == "ready"
    overall = state.status
    if overall == "ready" and (not state.llm_configured or state.vector_store_state != "ready"):
        overall = "degraded"

    return HealthResponse(
        status=overall,  # type: ignore[arg-type]
        version=settings.app_version,
        uptime_s=int(time.time() - state.started_at),
        checks={
            "backend": HealthCheck(ok=True, state="running"),
            "vector_store": HealthCheck(
                ok=store_ok,
                state=state.vector_store_state,
                chunks=state.vector_store_chunks,
                detail=None
                if store_ok
                else "Open the Knowledge Library and ingest a document."
                if state.vector_store_state in {"empty", "missing"}
                else state.detail,
            ),
            "llm": HealthCheck(
                ok=state.llm_configured,
                configured=state.llm_configured,
                model=settings.groq_model,
                detail=None
                if state.llm_configured
                else "Initializing LLM provider..."
                if state.status == "initializing"
                else "GROQ_API_KEY is not set on the server. Configure a key in Settings (BYOK) or on the server.",
            ),
            "embeddings": HealthCheck(
                ok=state.embeddings_ready,
                state="ready" if state.embeddings_ready else "unavailable",
                model=settings.embedding_model,
                detail=None if state.embeddings_ready else state.detail,
            ),
        },
    )
