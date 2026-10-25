"""Tests for auto-seeding the empty Chroma vector store on startup."""
from __future__ import annotations

from pathlib import Path

from tests.conftest import DOC_A, FakeRAGService, make_settings
from app.services.database_service import auto_seed_empty_store


def test_auto_seed_populates_empty_store(tmp_path: Path):
    settings = make_settings(tmp_path, auto_seed_on_startup=True)
    settings.documents_path.mkdir(parents=True, exist_ok=True)
    (settings.documents_path / "deeplearning.txt").write_text(DOC_A, encoding="utf-8")

    service = FakeRAGService(settings)
    service.initialize()

    assert service.state.vector_store_chunks > 0
    assert service.state.vector_store_state == "ready"


def test_auto_seed_does_not_duplicate_existing_store(tmp_path: Path):
    settings = make_settings(tmp_path, auto_seed_on_startup=True)
    settings.documents_path.mkdir(parents=True, exist_ok=True)
    (settings.documents_path / "deeplearning.txt").write_text(DOC_A, encoding="utf-8")

    service = FakeRAGService(settings)
    service.initialize()
    initial_chunks = service.state.vector_store_chunks
    assert initial_chunks > 0

    # Running auto_seed again on a non-empty store adds 0 chunks
    added = auto_seed_empty_store(settings, service)
    assert added == 0
    assert service.state.vector_store_chunks == initial_chunks


def test_auto_seed_disabled_by_settings(tmp_path: Path):
    settings = make_settings(tmp_path, auto_seed_on_startup=False)
    settings.documents_path.mkdir(parents=True, exist_ok=True)
    (settings.documents_path / "deeplearning.txt").write_text(DOC_A, encoding="utf-8")

    service = FakeRAGService(settings)
    service.initialize()

    # Did not auto-seed because setting was False
    assert service.state.vector_store_chunks == 0
    assert service.state.vector_store_state in {"empty", "missing"}
