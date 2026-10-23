"""Health endpoint behaviour."""
from __future__ import annotations

from tests.conftest import build_service, make_client, make_settings


def test_health_ready_with_seeded_store(tmp_path):
    settings = make_settings(tmp_path)
    service = build_service(settings, seed=True)
    client = make_client(service)

    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ready"
    assert body["checks"]["backend"]["ok"] is True
    assert body["checks"]["vector_store"]["ok"] is True
    assert body["checks"]["vector_store"]["chunks"] >= 2
    assert body["checks"]["llm"]["configured"] is True
    assert body["checks"]["embeddings"]["ok"] is True


def test_health_degraded_without_api_key(tmp_path):
    settings = make_settings(tmp_path, groq_api_key=None)
    service = build_service(settings, seed=True)
    client = make_client(service)

    body = client.get("/api/health").json()
    assert body["status"] == "degraded"
    assert body["checks"]["llm"]["configured"] is False
    # The health payload must never contain the key value itself.
    assert "test-key" not in str(body)


def test_health_reports_empty_store(tmp_path):
    settings = make_settings(tmp_path)
    service = build_service(settings, seed=False)
    client = make_client(service)

    body = client.get("/api/health").json()
    assert body["checks"]["vector_store"]["ok"] is False
    assert body["checks"]["vector_store"]["state"] in {"empty", "missing"}
