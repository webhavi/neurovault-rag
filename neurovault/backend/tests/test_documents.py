"""Knowledge library: listing, ingestion jobs, validation, re-index, stats."""
from __future__ import annotations

import time

from tests.conftest import build_service, make_client, make_settings


def wait_job(client, job_id: str, timeout_s: float = 15.0):
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        res = client.get(f"/api/documents/ingest/jobs/{job_id}")
        if res.status_code == 200:
            body = res.json()
            if body["status"] in {"completed", "failed"}:
                return body
        time.sleep(0.1)
    raise AssertionError("job did not finish in time")


def test_documents_listing_marks_indexed_state(tmp_path):
    settings = make_settings(tmp_path)
    client = make_client(build_service(settings, seed=True))
    res = client.get("/api/documents")
    assert res.status_code == 200
    docs = {d["name"]: d for d in res.json()["documents"]}
    assert docs["deeplearning.txt"]["indexed"] is True
    assert docs["deeplearning.txt"]["chunk_count"] >= 1
    assert docs["gru.txt"]["indexed"] is True


def test_ingest_txt_upload_end_to_end(tmp_path):
    settings = make_settings(tmp_path)
    client = make_client(build_service(settings, seed=True))

    res = client.post(
        "/api/documents/ingest",
        files={"file": ("attention.txt", b"Attention mechanisms weigh tokens. " * 20, "text/plain")},
    )
    assert res.status_code == 202
    job_id = res.json()["job_id"]
    job = wait_job(client, job_id)
    assert job["status"] == "completed", job
    assert job["chunks_added"] >= 1

    docs = {d["name"]: d for d in client.get("/api/documents").json()["documents"]}
    assert docs["attention.txt"]["indexed"] is True
    # The store really contains the new chunks:
    assert client.get("/api/stats").json()["total_chunks"] >= 3


def test_ingest_rejects_unsupported_type(tmp_path):
    settings = make_settings(tmp_path)
    client = make_client(build_service(settings, seed=True))
    res = client.post(
        "/api/documents/ingest",
        files={"file": ("pyvenv.cfg", b"home = /usr/bin", "application/octet-stream")},
    )
    assert res.status_code == 415
    assert res.json()["detail"]["code"] == "unsupported_type"


def test_ingest_rejects_empty_file(tmp_path):
    settings = make_settings(tmp_path)
    client = make_client(build_service(settings, seed=True))
    res = client.post("/api/documents/ingest", files={"file": ("empty.txt", b"", "text/plain")})
    assert res.status_code == 422


def test_ingest_rejects_oversized_file(tmp_path):
    settings = make_settings(tmp_path, max_upload_mb=0)
    client = make_client(build_service(settings, seed=True))
    res = client.post(
        "/api/documents/ingest",
        files={"file": ("big.txt", b"x" * 1024, "text/plain")},
    )
    assert res.status_code == 413


def test_ingest_rejects_path_traversal_names(tmp_path):
    settings = make_settings(tmp_path)
    client = make_client(build_service(settings, seed=True))
    res = client.post(
        "/api/documents/ingest",
        files={"file": ("../../evil.txt", b"data", "text/plain")},
    )
    assert res.status_code == 202
    job = wait_job(client, res.json()["job_id"])
    # Sanitised to "evil.txt"; nothing escapes the uploads dir.
    from pathlib import Path

    assert (settings.uploads_path / "evil.txt").exists()
    assert not (settings.uploads_path.parent / "evil.txt").exists()
    assert job["filename"] == "evil.txt"


def test_reindex_is_idempotent(tmp_path):
    settings = make_settings(tmp_path)
    client = make_client(build_service(settings, seed=True))
    before = client.get("/api/stats").json()["total_chunks"]
    assert before >= 2

    res = client.post("/api/documents/reindex", json={"source": "deeplearning.txt"})
    assert res.status_code == 202
    job = wait_job(client, res.json()["job_id"])
    assert job["status"] == "completed", job

    after = client.get("/api/stats").json()["total_chunks"]
    assert after == before  # delete-then-add keeps counts stable


def test_reindex_unknown_document_404(tmp_path):
    settings = make_settings(tmp_path)
    client = make_client(build_service(settings, seed=True))
    res = client.post("/api/documents/reindex", json={"source": "ghost.pdf"})
    assert res.status_code == 404


def test_stats_shape(tmp_path):
    settings = make_settings(tmp_path)
    client = make_client(build_service(settings, seed=True))
    body = client.get("/api/stats").json()
    assert body["total_chunks"] >= 2
    assert {d["source"] for d in body["documents"]} >= {"deeplearning.txt", "gru.txt"}
    assert body["retrieval"]["strategy"] == "mmr"
    assert body["collection_name"]
