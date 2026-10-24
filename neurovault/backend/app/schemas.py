"""Pydantic request/response schemas shared by the API routers.

Field values are produced from real execution results only. Optional fields
that cannot be determined at runtime are `None` and are rendered as
"Unavailable" by the frontend instead of being fabricated.
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

# --------------------------------------------------------------------------- #
# Chat
# --------------------------------------------------------------------------- #


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=8000)


class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    # Accepted for API compatibility / future use. The current grounded prompt
    # is single-turn: answers are produced from the retrieved context for the
    # question alone (preserving the original pipeline behaviour).
    session_id: Optional[str] = Field(default=None, max_length=100)
    history: Optional[list[ChatMessage]] = None
    byok_api_key: Optional[str] = Field(default=None, max_length=256)
    byok_provider: Optional[str] = Field(default=None, max_length=50)
    byok_model: Optional[str] = Field(default=None, max_length=100)


class SourceRef(BaseModel):
    document: str
    page: Optional[int] = None
    content_preview: str


class RetrievalInfo(BaseModel):
    strategy: str
    chunks_retrieved: int
    duration_ms: Optional[int] = None


class ChatResponse(BaseModel):
    answer: str
    sources: list[SourceRef]
    retrieval: RetrievalInfo
    metadata: dict[str, Any]


# --------------------------------------------------------------------------- #
# Documents / knowledge library
# --------------------------------------------------------------------------- #


class DocumentInfo(BaseModel):
    name: str
    file_type: str
    size_bytes: Optional[int] = None
    page_count: Optional[int] = None
    indexed: bool
    chunk_count: int = 0
    last_ingested_at: Optional[str] = None
    error: Optional[str] = None
    origin: Literal["documents_dir", "uploads_dir", "indexed_only"] = "documents_dir"


class DocumentsResponse(BaseModel):
    documents: list[DocumentInfo]
    documents_dir_label: str  # display label only, never an absolute path
    allowed_extensions: list[str]


class IngestAccepted(BaseModel):
    job_id: str
    filename: str
    status: str = "queued"


class IngestJobStatus(BaseModel):
    job_id: str
    filename: str
    status: Literal["queued", "processing", "completed", "failed"]
    stage: Optional[str] = None
    chunks_added: Optional[int] = None
    pages: Optional[int] = None
    error: Optional[str] = None
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    duration_ms: Optional[int] = None


class ReindexRequest(BaseModel):
    source: str = Field(min_length=1, max_length=255)


# --------------------------------------------------------------------------- #
# Retrieval configuration & trace
# --------------------------------------------------------------------------- #


class RetrievalConfigResponse(BaseModel):
    strategy: str
    k: int
    fetch_k: int
    lambda_mult: float
    embedding_provider: str
    embedding_model: str
    llm_provider: str
    llm_model: str
    chunk_size: int
    chunk_overlap: int


class TraceRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)


class TraceCandidate(BaseModel):
    document: str
    page: Optional[int] = None
    preview: str
    similarity: Optional[float] = None
    selected_by_mmr: bool = False
    projection: Optional[list[float]] = None


class TraceTimings(BaseModel):
    embedding_ms: Optional[int] = None
    candidate_search_ms: Optional[int] = None
    mmr_selection_ms: Optional[int] = None
    projection_ms: Optional[int] = None
    total_ms: Optional[int] = None


class TraceResponse(BaseModel):
    question: str
    status: Literal["ok", "empty", "unavailable"]
    detail: Optional[str] = None
    query_embedding_dim: Optional[int] = None
    query_point: Optional[list[float]] = None
    candidates: list[TraceCandidate] = []
    context_chars: Optional[int] = None
    context_preview: Optional[str] = None
    timings: TraceTimings = TraceTimings()
    mmr_params: dict[str, Any] = {}
    notes: list[str] = []


# --------------------------------------------------------------------------- #
# Health & stats
# --------------------------------------------------------------------------- #


class HealthCheck(BaseModel):
    ok: bool = False
    state: str = "unknown"
    detail: Optional[str] = None
    model: Optional[str] = None
    chunks: Optional[int] = None
    configured: Optional[bool] = None


class HealthResponse(BaseModel):
    status: Literal["ready", "degraded", "initializing", "error"]
    version: str
    uptime_s: int
    checks: dict[str, HealthCheck]


class DocumentStat(BaseModel):
    source: str
    chunks: int


class StatsResponse(BaseModel):
    status: str
    total_chunks: int
    documents: list[DocumentStat]
    embedding_model: str
    llm_model: str
    retrieval: dict[str, Any]
    collection_name: str
    generated_at: str


# --------------------------------------------------------------------------- #
# Errors
# --------------------------------------------------------------------------- #


class ErrorBody(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorBody
