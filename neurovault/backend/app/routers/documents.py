"""Documents: listing, upload ingestion (background jobs), re-index, stats."""
from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, UploadFile

from app.schemas import (
    DocumentStat,
    DocumentsResponse,
    IngestAccepted,
    IngestJobStatus,
    ReindexRequest,
    StatsResponse,
)
from app.services import database_service as dbs
from app.services.database_service import INGEST_LOCK, IngestionError, utc_now_iso

log = logging.getLogger("neurovault.documents")

router = APIRouter()


@dataclass
class Job:
    job_id: str
    filename: str
    kind: str  # ingest | reindex
    status: str = "queued"
    stage: Optional[str] = None
    chunks_added: Optional[int] = None
    pages: Optional[int] = None
    error: Optional[str] = None
    started_at: str = field(default_factory=utc_now_iso)
    finished_at: Optional[str] = None
    _t0: float = field(default_factory=time.perf_counter, repr=False)

    def to_schema(self) -> IngestJobStatus:
        duration = None
        if self.finished_at:
            duration = int((time.perf_counter() - self._t0) * 1000)
        return IngestJobStatus(
            job_id=self.job_id,
            filename=self.filename,
            status=self.status,  # type: ignore[arg-type]
            stage=self.stage,
            chunks_added=self.chunks_added,
            pages=self.pages,
            error=self.error,
            started_at=self.started_at,
            finished_at=self.finished_at,
            duration_ms=duration,
        )


JOBS: dict[str, Job] = {}
MAX_JOBS_KEPT = 100


def _register(job: Job) -> None:
    JOBS[job.job_id] = job
    if len(JOBS) > MAX_JOBS_KEPT:  # keep memory bounded
        for old in sorted(JOBS.keys())[: len(JOBS) - MAX_JOBS_KEPT]:
            JOBS.pop(old, None)


def _run_job(job: Job, rag: Any, settings: Any, path: Optional[Path], source: Optional[str]) -> None:
    try:
        job.status = "processing"
        job.stage = "loading"
        if job.kind == "reindex" and source:
            result = dbs.reindex_source(settings, rag, source)
        elif path is not None:
            job.stage = "embedding"
            result = dbs.ingest_path(settings, rag, path)
        else:  # pragma: no cover
            raise IngestionError("Invalid job parameters.")
        job.chunks_added = result["chunks_added"]
        job.pages = result.get("pages")
        job.status = "completed"
        job.stage = "done"
    except IngestionError as exc:
        job.status = "failed"
        job.error = str(exc)
        log.warning("Ingestion job %s failed: %s", job.job_id, exc)
    except Exception as exc:  # noqa: BLE001
        job.status = "failed"
        job.error = "Unexpected processing error."
        log.exception("Ingestion job %s crashed", job.job_id)
    finally:
        job.finished_at = utc_now_iso()


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #


@router.get("/documents", response_model=DocumentsResponse)
def list_documents(request: Request) -> DocumentsResponse:
    rag = request.app.state.rag
    settings = request.app.state.settings
    stats = rag.source_chunk_counts()
    return DocumentsResponse(
        documents=dbs.list_documents(settings, stats),
        documents_dir_label=settings.documents_dir,
        allowed_extensions=settings.allowed_ext_list,
    )


@router.post("/documents/ingest", response_model=IngestAccepted, status_code=202)
async def ingest(
    request: Request,
    background: BackgroundTasks,
    file: UploadFile,
) -> IngestAccepted:
    settings = request.app.state.settings
    rag = request.app.state.rag

    if rag.embeddings is None:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "embeddings_unavailable",
                "message": "The embedding backend is not available on the server, so ingestion "
                "is disabled. Check the backend logs and install the requirements.",
            },
        )

    filename = file.filename or "upload"
    ext = Path(filename).suffix.lower()
    if ext not in settings.allowed_ext_list or ext not in dbs.ALLOWED_EXTS:
        raise HTTPException(
            status_code=415,
            detail={
                "code": "unsupported_type",
                "message": f"'{ext or 'unknown'}' files are not supported. Allowed: "
                + ", ".join(settings.allowed_ext_list),
            },
        )

    payload = await file.read()
    if len(payload) == 0:
        raise HTTPException(status_code=422, detail={"code": "empty_file", "message": "The uploaded file is empty."})
    if len(payload) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=413,
            detail={
                "code": "file_too_large",
                "message": f"File exceeds the {settings.max_upload_mb} MB limit.",
            },
        )

    try:
        path = dbs.save_upload(settings, filename, payload)
    except IngestionError as exc:
        raise HTTPException(status_code=422, detail={"code": "invalid_filename", "message": str(exc)}) from exc

    job = Job(job_id=uuid.uuid4().hex[:12], filename=path.name, kind="ingest")
    _register(job)
    background.add_task(_run_job, job, rag, settings, path, None)
    return IngestAccepted(job_id=job.job_id, filename=path.name)


@router.post("/documents/reindex", response_model=IngestAccepted, status_code=202)
def reindex(payload: ReindexRequest, request: Request, background: BackgroundTasks) -> IngestAccepted:
    settings = request.app.state.settings
    rag = request.app.state.rag
    safe = Path(payload.source).name
    known = {d.name for d in dbs.list_documents(settings, rag.source_chunk_counts())}
    if safe not in known:
        raise HTTPException(
            status_code=404,
            detail={"code": "unknown_document", "message": f"'{safe}' is not a known document."},
        )
    if rag.state.vector_store_state in {"missing", "error"}:
        raise HTTPException(
            status_code=409,
            detail={"code": "store_unavailable", "message": "The vector store is not available."},
        )
    job = Job(job_id=uuid.uuid4().hex[:12], filename=safe, kind="reindex")
    _register(job)
    background.add_task(_run_job, job, rag, settings, None, safe)
    return IngestAccepted(job_id=job.job_id, filename=safe)


@router.get("/documents/ingest/jobs", response_model=list[IngestJobStatus])
def list_jobs() -> list[IngestJobStatus]:
    return [JOBS[k].to_schema() for k in sorted(JOBS.keys(), reverse=True)]


@router.get("/documents/ingest/jobs/{job_id}", response_model=IngestJobStatus)
def get_job(job_id: str) -> IngestJobStatus:
    job = JOBS.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail={"code": "unknown_job", "message": "Unknown job id."})
    return job.to_schema()


@router.get("/stats", response_model=StatsResponse)
def stats(request: Request) -> StatsResponse:
    rag = request.app.state.rag
    settings = request.app.state.settings
    stats = rag.source_chunk_counts()
    total = sum(int(e.get("chunks", 0)) for e in stats.values())
    state = "ready" if total > 0 and rag.state.status != "error" else (
        "degraded" if rag.state.status != "error" else "error"
    )
    return StatsResponse(
        status=state,
        total_chunks=total,
        documents=[DocumentStat(source=s, chunks=int(e.get("chunks", 0))) for s, e in sorted(stats.items())],
        embedding_model=settings.embedding_model,
        llm_model=settings.groq_model,
        retrieval={
            "strategy": settings.search_type,
            "k": settings.retriever_k,
            "fetch_k": settings.retriever_fetch_k,
            "lambda_mult": settings.retriever_lambda_mult,
        },
        collection_name=settings.collection_name,
        generated_at=utc_now_iso(),
    )
