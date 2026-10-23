"""NeuroVault FastAPI application factory.

Responsibilities:
  * structured logging + secret-safe error envelopes
  * CORS restricted to the configured frontend origins
  * background (non-blocking) RAG initialization at startup
  * optional static hosting of the built frontend (sandbox preview only)
"""
from __future__ import annotations

import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import Settings, get_settings
from app.routers import chat, documents, health, retrieval
from app.services.rag_service import RAGService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s :: %(message)s",
)
log = logging.getLogger("neurovault.main")


def _start_initialization(app: FastAPI) -> None:
    rag: RAGService = app.state.rag
    thread = threading.Thread(target=rag.initialize, name="rag-init", daemon=True)
    thread.start()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Tests may pre-inject a service; only initialize when none exists yet.
    if getattr(app.state, "rag", None) is None:
        settings: Settings = app.state.settings
        app.state.rag = RAGService(settings)
        _start_initialization(app)
    yield
    # No persistent handles to close explicitly; Chroma persists on disk.


def create_app(settings: Settings | None = None) -> FastAPI:
    app = FastAPI(
        title="NeuroVault API",
        description="Deep-learning RAG knowledge lab backend",
        version=settings.app_version if settings else "1.0.0",
        lifespan=lifespan,
    )
    app.state.settings = settings or get_settings()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=app.state.settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    app.include_router(health.router, prefix="/api")
    app.include_router(chat.router, prefix="/api")
    app.include_router(documents.router, prefix="/api")
    app.include_router(retrieval.router, prefix="/api")

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        log.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content={"error": {"code": "internal_error", "message": "Unexpected server error."}},
        )

    # Optional static hosting of the built SPA (used for the sandbox preview).
    from app.config import resolve_path

    static = app.state.settings.static_dir
    if static:
        static_path = resolve_path(static)
        if static_path.is_dir():
            from fastapi.staticfiles import StaticFiles

            # /preview first: the catch-all "/" mount would otherwise swallow it.
            app.mount("/preview", StaticFiles(directory=str(static_path), html=True), name="spa-preview")
            app.mount("/", StaticFiles(directory=str(static_path), html=True), name="spa")
            log.info("Serving frontend from %s", static_path)

    return app


app = create_app()
