"""Retrieval config + trace: real values, PCA projection, no fabrication."""
from __future__ import annotations

from tests.conftest import build_service, make_client, make_settings


def test_retrieval_config_preserves_defaults(tmp_path):
    settings = make_settings(tmp_path)
    client = make_client(build_service(settings, seed=True))
    body = client.get("/api/retrieval/config").json()
    assert body["strategy"] == "mmr"
    assert body["k"] == 4
    assert body["fetch_k"] == 10
    assert body["lambda_mult"] == 0.5
    assert body["chunk_size"] == 1000
    assert body["chunk_overlap"] == 200
    assert "MiniLM" in body["embedding_model"] or "sentence-transformers" in body["embedding_model"]


def test_trace_returns_real_projection(tmp_path):
    settings = make_settings(tmp_path)
    client = make_client(build_service(settings, seed=True))
    res = client.post("/api/retrieval/trace", json={"question": "How do GRUs handle gates?"})
    assert res.status_code == 200
    body = res.json()

    assert body["status"] == "ok"
    assert body["query_embedding_dim"] == 8  # FakeEmbeddings dimension
    assert body["query_point"] is not None and len(body["query_point"]) == 3
    assert body["candidates"], "expected at least one candidate"
    assert len(body["candidates"]) <= settings.retriever_fetch_k

    mmr_selected = [c for c in body["candidates"] if c["selected_by_mmr"]]
    assert 1 <= len(mmr_selected) <= settings.retriever_k
    for cand in body["candidates"]:
        assert len(cand["projection"]) == 3
        assert -1.0001 <= cand["similarity"] <= 1.0001
        assert cand["document"]  # never empty
    assert body["mmr_params"]["lambda_mult"] == 0.5
    assert body["timings"]["embedding_ms"] is not None
    assert any("PCA" in note for note in body["notes"])


def test_trace_empty_store(tmp_path):
    settings = make_settings(tmp_path)
    client = make_client(build_service(settings, seed=False))
    res = client.post("/api/retrieval/trace", json={"question": "anything"})
    assert res.status_code == 200
    assert res.json()["status"] == "empty"


def test_trace_rejects_blank_question(tmp_path):
    settings = make_settings(tmp_path)
    client = make_client(build_service(settings, seed=True))
    assert client.post("/api/retrieval/trace", json={"question": "  "}).status_code == 422
