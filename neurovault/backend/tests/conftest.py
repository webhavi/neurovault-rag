"""Shared test fixtures.

The suite exercises the REAL FastAPI app, the REAL Chroma store and the REAL
retriever/trace code paths; only the two heavyweight externals are faked:
  * the embedding model (deterministic hash vectors, no model download)
  * the Groq LLM (canned responses / raisable errors, no network)
"""
from __future__ import annotations

import hashlib
import math
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault("ANONYMIZED_TELEMETRY", "False")

from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402
from app.services.rag_service import RAGService  # noqa: E402


class FakeEmbeddings:
    """Deterministic, dependency-free embeddings for tests."""

    def __init__(self, dim: int = 8) -> None:
        self.dim = dim

    def _vec(self, text: str) -> list[float]:
        vec = [0.0] * self.dim
        for token in (text or "").lower().split():
            h = int(hashlib.md5(token.encode("utf-8")).hexdigest(), 16)
            vec[h % self.dim] += 1.0
            vec[(h // self.dim) % self.dim] += 0.5
        norm = math.sqrt(sum(x * x for x in vec)) or 1.0
        return [x / norm for x in vec]

    def embed_query(self, text: str) -> list[float]:
        return self._vec(text)

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._vec(t) for t in texts]


@dataclass
class FakeLLM:
    reply: str = "Backpropagation propagates the error backwards to update weights."
    error: Exception | None = None

    def invoke(self, prompt: Any) -> Any:
        if self.error is not None:
            raise self.error
        return SimpleNamespace(content=self.reply)


class FakeRAGService(RAGService):
    """RAGService with faked embedding model + LLM, real Chroma + retriever."""

    def _init_embeddings(self) -> None:
        self.embeddings = FakeEmbeddings()
        self.state.embeddings_ready = True

    def _init_llm(self) -> None:
        if self.settings.groq_api_key == "test-key":
            self.llm = FakeLLM()
            self.state.llm_configured = True
        else:
            self.state.llm_configured = False

    def set_llm_error(self, error: Exception) -> None:
        self.llm = FakeLLM(error=error)


DOC_A = (
    "Backpropagation is the algorithm used to train neural networks. "
    "It computes gradients of the loss with respect to every weight by "
    "applying the chain rule backwards through the network layers. "
    "Deep networks suffer from vanishing gradients when signals shrink "
    "across many layers."
)
DOC_B = (
    "Gated Recurrent Units (GRU) are a type of recurrent neural network. "
    "A GRU uses update gates and reset gates to control information flow "
    "through time. Compared with vanilla RNNs, GRUs mitigate vanishing "
    "gradients and are cheaper than LSTMs because they have fewer gates. "
    "Embeddings map tokens into dense vectors that support semantic search."
)


def make_settings(tmp_path: Path, **overrides: Any) -> Settings:
    base: dict[str, Any] = {
        "groq_api_key": "test-key",
        "chroma_persist_directory": str(tmp_path / "chroma_db"),
        "documents_dir": str(tmp_path / "docs"),
        "uploads_dir": str(tmp_path / "uploads"),
        "auto_seed_on_startup": False,
        "_env_file": None,  # never read the developer's real .env during tests
    }
    base.update(overrides)
    return Settings(**base)


def seed_documents(settings: Settings) -> None:
    settings.documents_path.mkdir(parents=True, exist_ok=True)
    (settings.documents_path / "deeplearning.txt").write_text(DOC_A, encoding="utf-8")
    (settings.documents_path / "gru.txt").write_text(DOC_B, encoding="utf-8")


def build_service(settings: Settings, seed: bool = True) -> FakeRAGService:
    if seed:
        seed_documents(settings)
    service = FakeRAGService(settings)
    service.initialize()
    if seed:
        # Index the seeded files through the REAL ingestion path.
        from app.services.database_service import ingest_path

        for path in sorted(settings.documents_path.glob("*")):
            if path.suffix.lower() in {".pdf", ".txt", ".md"}:
                ingest_path(settings, service, path)
    return service  # type: ignore[return-value]


def make_client(service: FakeRAGService):
    app = create_app(service.settings)
    app.state.rag = service  # lifespan sees an existing service and skips init
    return TestClient(app)


@pytest.fixture()
def seeded_client(tmp_path):
    settings = make_settings(tmp_path)
    service = build_service(settings, seed=True)
    return make_client(service), service, settings


@pytest.fixture()
def empty_client(tmp_path):
    settings = make_settings(tmp_path)
    service = build_service(settings, seed=False)
    return make_client(service), service, settings
