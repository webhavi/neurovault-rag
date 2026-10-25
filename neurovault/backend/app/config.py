"""Central configuration for the NeuroVault backend.

All values can be overridden through environment variables or a `.env` file
placed in the backend working directory. Secrets (GROQ_API_KEY) must never be
committed or exposed through the API.
"""
from __future__ import annotations

import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Project root = the directory that contains `backend/`. In the original
# workspace this is the folder holding `document_loaders/`, `chroma_db/`, etc.
# Using the file location makes path resolution independent of the CWD that
# uvicorn is started from.
_DEFAULT_PROJECT_ROOT = Path(__file__).resolve().parents[2]

PROJECT_ROOT = Path(os.environ.get("NEUROVAULT_BASE_DIR", _DEFAULT_PROJECT_ROOT))


def resolve_path(value: str | Path) -> Path:
    """Resolve *value* against the project root unless it is absolute."""
    p = Path(value).expanduser()
    return p if p.is_absolute() else (PROJECT_ROOT / p).resolve()


class Settings(BaseSettings):
    """Safe, typed application settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- Persistence -------------------------------------------------------
    # Fixes the original inconsistency: main.py used "Chroma_db" while
    # createdatabase.py used "chroma_db". One configurable path is now shared
    # by every service. Default matches createdatabase.py so the existing
    # index is picked up unchanged.
    chroma_persist_directory: str = "chroma_db"
    # createdatabase.py used the LangChain default collection, so the default
    # here must stay "langchain" to remain compatible with the existing index.
    collection_name: str = "langchain"

    # --- Models ------------------------------------------------------------
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    groq_model: str = "openai/gpt-oss-120b"
    groq_api_key: str | None = None
    llm_timeout_s: float = 60.0

    # --- Retrieval (preserved from main.py) --------------------------------
    search_type: str = "mmr"
    retriever_k: int = 4
    retriever_fetch_k: int = 10
    retriever_lambda_mult: float = 0.5

    # --- Ingestion (preserved from createdatabase.py) ----------------------
    chunk_size: int = 1000
    chunk_overlap: int = 200
    max_upload_mb: int = 25
    allowed_extensions: str = ".pdf,.txt,.md"

    # --- Paths -------------------------------------------------------------
    documents_dir: str = "document_loaders"
    uploads_dir: str = "uploads"

    # --- HTTP --------------------------------------------------------------
    cors_origins: str = "*"
    init_timeout_s: float = 240.0
    chat_wait_ready_s: float = 120.0

    # --- Misc --------------------------------------------------------------
    app_version: str = "1.0.0"
    # Automatically serve built frontend SPA if frontend/dist exists.
    static_dir: str | None = "frontend/dist"
    log_level: str = "INFO"
    auto_seed_on_startup: bool = True

    # --- Derived helpers ---------------------------------------------------
    @property
    def cors_origin_list(self) -> list[str]:
        if self.cors_origins.strip() == "*":
            return ["*"]
        origins = [o.strip() for o in self.cors_origins.split(",") if o.strip()]
        for default in ("http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173"):
            if default not in origins:
                origins.append(default)
        return origins

    @property
    def allowed_ext_list(self) -> list[str]:
        return [e.strip().lower() for e in self.allowed_extensions.split(",") if e.strip()]

    @property
    def chroma_path(self) -> Path:
        return resolve_path(self.chroma_persist_directory)

    @property
    def documents_path(self) -> Path:
        return resolve_path(self.documents_dir)

    @property
    def uploads_path(self) -> Path:
        return resolve_path(self.uploads_dir)

    @property
    def max_upload_bytes(self) -> int:
        return int(self.max_upload_mb * 1024 * 1024)


def get_settings() -> Settings:
    """Return a Settings instance (fresh per call; cheap)."""
    return Settings()
