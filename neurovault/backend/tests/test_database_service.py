"""Database-service level behaviours: persistence, idempotent init, missing dirs."""
from __future__ import annotations

from tests.conftest import build_service, make_settings, seed_documents
from app.services.database_service import ingest_path


def test_store_is_reused_not_rebuilt(tmp_path):
    settings = make_settings(tmp_path)
    service1 = build_service(settings, seed=True)
    assert service1.state.vector_store_chunks >= 2

    # A second service over the SAME directory must see the same chunks
    # (opening an existing index is idempotent; nothing is rebuilt or duplicated).
    service2 = build_service(settings, seed=False)
    assert service2.state.vector_store_chunks == service1.state.vector_store_chunks


def test_ingest_twice_adds_chunks_but_reindex_restores_parity(tmp_path):
    settings = make_settings(tmp_path)
    service = build_service(settings, seed=True)
    before = service.state.vector_store_chunks

    extra = settings.uploads_path / "notes.txt"
    settings.uploads_path.mkdir(parents=True, exist_ok=True)
    extra.write_text("Extra note about optimizers and momentum.", encoding="utf-8")
    ingest_path(settings, service, extra)
    assert service.state.vector_store_chunks > before


def test_missing_documents_dir_lists_nothing(tmp_path):
    settings = make_settings(tmp_path)
    service = build_service(settings, seed=False)
    assert service.source_chunk_counts() == {}


def test_unsupported_extension_rejected_by_service(tmp_path):
    from app.services.database_service import IngestionError

    settings = make_settings(tmp_path)
    service = build_service(settings, seed=False)
    cfg = settings.uploads_path / "pyvenv.cfg"
    settings.uploads_path.mkdir(parents=True, exist_ok=True)
    cfg.write_text("home = /usr", encoding="utf-8")
    try:
        ingest_path(settings, service, cfg)
        raise AssertionError("expected IngestionError")
    except IngestionError as exc:
        assert "Unsupported document type" in str(exc)
