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
        allow_origin_regex=r"^https://.*\.vercel\.app$|^https://.*\.onrender\.com$",
        allow_credentials=False,
        allow_methods=["*"],
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

    # Static hosting of the built frontend SPA
    from app.config import resolve_path

    static = app.state.settings.static_dir
    static_path = resolve_path(static) if static else None
    if static_path is not None and static_path.is_dir():
        from fastapi.staticfiles import StaticFiles
        from starlette.responses import FileResponse

        index_file = static_path / "index.html"
        assets_dir = static_path / "assets"
        if assets_dir.is_dir():
            app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="spa-assets")

        @app.get("/{full_path:path}", include_in_schema=False)
        async def serve_spa(full_path: str):
            target = static_path / full_path
            if full_path and target.is_file():
                return FileResponse(target)
            if index_file.is_file():
                return FileResponse(index_file)
            return JSONResponse(status_code=404, content={"detail": "Not found"})

        log.info("Serving frontend SPA from %s", static_path)
    else:
        @app.get("/", include_in_schema=False)
        async def root_status():
            return JSONResponse(
                status_code=200,
                content={
                    "name": "NeuroVault API",
                    "status": "online",
                    "version": app.state.settings.app_version,
                    "endpoints": {
                        "health": "/api/health",
                        "chat": "/api/chat",
                        "documents": "/api/documents",
                        "retrieval": "/api/retrieval",
                        "docs": "/docs",
                    },
                },
            )

    return app


app = create_app()
