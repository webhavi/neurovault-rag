"""Chat endpoint: validation, real retrieval path, provider error mapping."""
from __future__ import annotations

import pytest

from tests.conftest import build_service, make_client, make_settings


class RateLimitError(Exception):
    status_code = 429


class GroqTimeout(Exception):
    pass


def test_chat_success_with_sources(tmp_path):
    settings = make_settings(tmp_path)
    service = build_service(settings, seed=True)
    client = make_client(service)

    res = client.post("/api/chat", json={"question": "What is backpropagation?"})
    assert res.status_code == 200
    body = res.json()
    assert "Backpropagation" in body["answer"]
    assert body["retrieval"]["strategy"] == "mmr"
    assert body["retrieval"]["chunks_retrieved"] >= 1
    assert body["retrieval"]["duration_ms"] is not None
    assert len(body["sources"]) >= 1
    src = body["sources"][0]
    assert src["document"] in {"deeplearning.txt", "gru.txt"}
    assert isinstance(src["content_preview"], str) and src["content_preview"]
    assert body["metadata"]["duration_ms"] >= 0
    assert body["metadata"]["model"] == settings.groq_model


def test_chat_rejects_empty_question(tmp_path):
    settings = make_settings(tmp_path)
    client = make_client(build_service(settings, seed=True))
    assert client.post("/api/chat", json={"question": ""}).status_code == 422
    assert client.post("/api/chat", json={"question": "   "}).status_code == 422


def test_chat_empty_vector_store(tmp_path):
    settings = make_settings(tmp_path)
    client = make_client(build_service(settings, seed=False))
    res = client.post("/api/chat", json={"question": "What is a GRU?"})
    assert res.status_code == 503
    assert res.json()["detail"]["code"] == "empty_vector_store"


def test_chat_without_llm_key(tmp_path):
    settings = make_settings(tmp_path, groq_api_key=None)
    client = make_client(build_service(settings, seed=True))
    res = client.post("/api/chat", json={"question": "What is a GRU?"})
    assert res.status_code == 503
    assert res.json()["detail"]["code"] == "provider_not_configured"


def test_chat_fallback_when_retrieval_is_empty(tmp_path, monkeypatch):
    settings = make_settings(tmp_path)
    service = build_service(settings, seed=True)
    client = make_client(service)

    class EmptyRetriever:
        def invoke(self, _q):
            return []

    monkeypatch.setattr(service, "retriever", EmptyRetriever())
    res = client.post("/api/chat", json={"question": "totally unknown topic"})
    assert res.status_code == 200
    body = res.json()
    assert "couldn't find that in the indexed documents" in body["answer"]
    assert body["sources"] == []
    assert body["metadata"]["grounded"] is False


def test_chat_rate_limit_maps_to_429(tmp_path, monkeypatch):
    settings = make_settings(tmp_path)
    service = build_service(settings, seed=True)
    service.set_llm_error(RateLimitError("rate limit"))
    client = make_client(service)
    res = client.post("/api/chat", json={"question": "What is backpropagation?"})
    assert res.status_code == 429
    assert res.json()["detail"]["code"] == "rate_limited"


def test_chat_timeout_maps_to_504(tmp_path, monkeypatch):
    settings = make_settings(tmp_path)
    service = build_service(settings, seed=True)
    service.set_llm_error(GroqTimeout("request timed out"))
    client = make_client(service)
    res = client.post("/api/chat", json={"question": "What is backpropagation?"})
    assert res.status_code == 504
    assert res.json()["detail"]["code"] == "provider_timeout"


def test_chat_does_not_leak_secrets(tmp_path):
    settings = make_settings(tmp_path)
    service = build_service(settings, seed=True)
    client = make_client(service)
    res = client.post("/api/chat", json={"question": "What is backpropagation?"})
    assert "test-key" not in res.text


def test_chat_byok_key_used(tmp_path, monkeypatch):
    settings = make_settings(tmp_path, groq_api_key=None)
    service = build_service(settings, seed=True)
    client = make_client(service)

    calls = []

    def mock_answer(question, byok_key=None, **kwargs):
        calls.append((byok_key, kwargs.get("byok_provider"), kwargs.get("byok_model")))
        from app.services.rag_service import AnswerResult
        return AnswerResult(
            answer="Answer generated with BYOK",
            sources=[],
            chunks_retrieved=1,
            retrieval_ms=10,
            generation_ms=10,
            model=kwargs.get("byok_model") or "openai/gpt-oss-120b",
        )

    monkeypatch.setattr(service, "answer", mock_answer)

    # Groq BYOK key
    res = client.post("/api/chat", json={"question": "What is backpropagation?", "byok_api_key": "gsk_byok_123"})
    assert res.status_code == 200
    assert calls[0] == ("gsk_byok_123", "groq", None)
    assert res.json()["answer"] == "Answer generated with BYOK"

    # OpenAI BYOK key with model
    res2 = client.post("/api/chat", json={
        "question": "What is backpropagation?",
        "byok_api_key": "sk-proj-openai-key",
        "byok_provider": "openai",
        "byok_model": "gpt-4o-mini"
    })
    assert res2.status_code == 200
    assert calls[1] == ("sk-proj-openai-key", "openai", "gpt-4o-mini")


