"""The shared RAG service.

A single instance owns the embedding model, the Chroma vector store, the MMR
retriever and the Groq LLM so that every endpoint reuses the same objects
(no duplicated RAG initialization).

Initialization is idempotent and runs in a background thread at startup:
an existing `chroma_db` directory is *opened*, never rebuilt.

The original pipeline behaviour from the user's `main.py` is preserved:
  * HuggingFaceEmbeddings (default MiniLM model)
  * Chroma vector store
  * retriever: search_type="mmr", k=4, fetch_k=10, lambda_mult=0.5
  * ChatGroq(model="openai/gpt-oss-120b")
  * a strictly context-grounded prompt
"""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional
from pydantic import SecretStr

try:
    from app.config import Settings
except ImportError:
    from ..config import Settings

log = logging.getLogger("neurovault.rag")

# The grounding requirement of the original prompt is preserved verbatim in
# meaning: answer ONLY from the provided context; otherwise say the answer is
# not in the indexed documents. The wording was professionalised.
SYSTEM_PROMPT = """You are NeuroVault, a precise deep-learning research assistant.

Rules:
1. Use ONLY the provided context to answer the question.
2. Keep the answer faithful to the context: never invent facts, numbers or citations.
3. When the context is relevant, answer clearly and concisely. You may use Markdown.
4. If the answer is not present in the context, reply with exactly:
"I couldn't find that in the indexed documents. Try rephrasing the question, or add the relevant source to the knowledge base."
"""

HUMAN_PROMPT = """Context:
{context}

Question:
{question}
"""

# Returned when the retriever finds nothing at all (mirrors the original
# pipeline's fallback outcome without wasting an LLM call).
FALLBACK_MESSAGE = (
    "I couldn't find that in the indexed documents. Try rephrasing the question, "
    "or add the relevant source to the knowledge base."
)


class DependencyMissing(Exception):
    """A required optional dependency is not importable."""


class _ChromaOnnxEmbeddings:
    """LangChain Embeddings adapter over Chroma's bundled ONNX MiniLM.

    Vector-compatible with sentence-transformers/all-MiniLM-L6-v2 (the same
    384-dimensional model), used only when torch/langchain-huggingface is not
    installed. Keeps the lab functional in constrained environments.
    """

    def __init__(self) -> None:
        from chromadb.utils.embedding_functions import ONNXMiniLM_L6_V2

        self._fn = ONNXMiniLM_L6_V2()

    def embed_query(self, text: str) -> list[float]:
        return [float(x) for x in self._fn([text])[0]]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        # Convert numpy float32 rows to plain floats: newer chromadb add()
        # rejects numpy scalars inside the embeddings payload.
        return [[float(x) for x in vector] for vector in self._fn(list(texts))]


class PipelineError(Exception):
    """The pipeline failed in a way the API layer should classify."""


@dataclass
class ServiceState:
    status: str = "idle"  # idle | initializing | ready | degraded | error
    detail: Optional[str] = None
    embeddings_ready: bool = False
    vector_store_state: str = "unknown"  # unknown | missing | empty | ready | error
    vector_store_chunks: int = 0
    llm_configured: bool = False
    started_at: float = field(default_factory=time.time)


@dataclass
class AnswerResult:
    answer: str
    sources: list[dict[str, Any]]
    chunks_retrieved: int
    retrieval_ms: int
    generation_ms: int
    model: str


class RAGService:
    """Owns every heavy object; safe for concurrent use behind the FastAPI app."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.state = ServiceState()
        self.lock = threading.RLock()
        self.embeddings: Any = None
        self.vectorstore: Any = None
        self.retriever: Any = None
        self.llm: Any = None

    # ------------------------------------------------------------------ #
    # Initialization
    # ------------------------------------------------------------------ #

    def initialize(self) -> None:
        """Build the pipeline. Never raises: failures land in `state`."""
        with self.lock:
            if self.state.status == "initializing":
                return
            self.state.status = "initializing"
            self.state.detail = None
        try:
            self._init_embeddings()
            self._init_vector_store()
            # If the store is empty, automatically seed initial documents (ephemeral-host support)
            if self.vectorstore is not None:
                try:
                    try:
                        from app.services.database_service import auto_seed_empty_store
                    except ImportError:
                        from .database_service import auto_seed_empty_store

                    auto_seed_empty_store(self.settings, self)
                except Exception as seed_exc:  # noqa: BLE001
                    log.warning("Auto-seed encountered an issue during startup: %s", seed_exc)
            self._init_retriever()
            self._init_llm()
        except Exception as exc:  # noqa: BLE001 - reported via state
            log.exception("RAG pipeline initialization failed")
            self.state.status = "error"
            self.state.detail = _safe_error(exc)
            return
        # Final status:
        #   ready     - embeddings + store + LLM all usable
        #   degraded  - usable for retrieval, but LLM unconfigured or store empty
        self.refresh_overall_status()
        log.info("RAG service initialized: status=%s", self.state.status)

    def refresh_overall_status(self) -> None:
        """Recompute ready/degraded from component state (e.g. after ingestion)."""
        with self.lock:
            if self.state.status == "error":
                return
            problems: list[str] = []
            if self.state.vector_store_state in {"empty", "missing", "error"}:
                problems.append("The vector store has no indexed documents.")
            if problems:
                self.state.status = "degraded"
                self.state.detail = " ".join(problems)
            else:
                self.state.status = "ready"
                self.state.detail = None

    def wait_ready(self, timeout_s: float) -> bool:
        """Block until initialization finished (any terminal state)."""
        deadline = time.time() + timeout_s
        while time.time() < deadline:
            if self.state.status not in {"idle", "initializing"}:
                return True
            time.sleep(0.1)
        return self.state.status not in {"idle", "initializing"}

    def _init_embeddings(self) -> None:
        import os

        # Prefer Chroma's bundled ONNX MiniLM in constrained/cloud environments (e.g. Render free tier: 512MB RAM).
        # PyTorch + sentence-transformers consumes ~588MB RAM which triggers Render's OOM killer (502 Bad Gateway).
        # Chroma's ONNX runtime consumes only ~53MB RAM with identical 384-dimensional vector compatibility.
        use_onnx = (
            os.environ.get("RENDER") is not None
            or os.environ.get("USE_ONNX_EMBEDDINGS", "true").lower() in {"1", "true", "yes"}
            or getattr(self.settings, "use_onnx_embeddings", True)
        )
        if use_onnx:
            try:
                log.info("Loading Chroma ONNX MiniLM embeddings (~53MB RAM, no torch)...")
                self.embeddings = _ChromaOnnxEmbeddings()
                self.state.embeddings_ready = True
                return
            except Exception as exc:  # noqa: BLE001
                log.warning("Chroma ONNX embeddings initialization failed (%s); trying HuggingFace...", exc)

        try:
            from langchain_huggingface import HuggingFaceEmbeddings
        except ImportError:
            # Graceful degradation: Chroma ships the SAME MiniLM model as an
            # ONNX runtime function - no torch required. Embedding quality and
            # vector compatibility with sentence-transformers/all-MiniLM-L6-v2
            # are identical; only the runtime differs.
            log.warning(
                "langchain-huggingface unavailable - falling back to Chroma's "
                "ONNX MiniLM embeddings (same model, no torch)."
            )
            self.embeddings = _ChromaOnnxEmbeddings()
            self.state.embeddings_ready = True
            return
        log.info("Loading embedding model %s ...", self.settings.embedding_model)
        self.embeddings = HuggingFaceEmbeddings(model_name=self.settings.embedding_model)
        self.state.embeddings_ready = True

    def _init_vector_store(self) -> None:
        from langchain_chroma import Chroma

        import os

        os.environ.setdefault("ANONYMIZED_TELEMETRY", "False")

        persist = self.settings.chroma_path
        existed = persist.exists() and any(persist.iterdir())
        log.info("Opening Chroma store at %s (pre-existing=%s)", persist, existed)
        self.vectorstore = Chroma(
            persist_directory=str(persist),
            embedding_function=self.embeddings,
            collection_name=self.settings.collection_name,
        )
        # Verify the store can actually be queried - a directory existing is
        # NOT proof of a working database.
        try:
            count = self.vectorstore._collection.count()  # noqa: SLF001 - official client object
        except Exception as exc:  # noqa: BLE001
            self.state.vector_store_state = "error"
            raise PipelineError(f"Chroma collection is not queryable: {_safe_error(exc)}") from exc
        self.state.vector_store_chunks = count
        if count > 0:
            self.state.vector_store_state = "ready"
        else:
            # "missing" = brand-new store created on first start;
            # "empty" = directory existed but contains no chunks.
            self.state.vector_store_state = "empty" if existed else "missing"
        # Touch the store with a cheap query so failures surface early.
        if count > 0:
            try:
                self.vectorstore.similarity_search_by_vector(
                    self.embeddings.embed_query("connectivity check"), k=1
                )
            except Exception as exc:  # noqa: BLE001
                self.state.vector_store_state = "error"
                raise PipelineError(f"Chroma query failed: {_safe_error(exc)}") from exc

    def _init_retriever(self) -> None:
        self.retriever = self.vectorstore.as_retriever(
            search_type=self.settings.search_type,
            search_kwargs={
                "k": self.settings.retriever_k,
                "fetch_k": self.settings.retriever_fetch_k,
                "lambda_mult": self.settings.retriever_lambda_mult,
            },
        )

    def _init_llm(self) -> None:
        key = (self.settings.groq_api_key or "").strip()
        if not key or key == "gsk_your_groq_api_key_here":
            log.info("No server GROQ_API_KEY set; running in client BYOK mode.")
            self.state.llm_configured = False
            return
        try:
            from langchain_groq import ChatGroq
        except ImportError as exc:  # pragma: no cover - depends on env
            raise DependencyMissing(
                "langchain-groq is not installed. Install the backend requirements."
            ) from exc
        self.llm = ChatGroq(
            model=self.settings.groq_model,
            api_key=SecretStr(key) if isinstance(key, str) else key,
            timeout=self.settings.llm_timeout_s,
        )
        self.state.llm_configured = True

    # ------------------------------------------------------------------ #
    # Chat (preserved behaviour of the original terminal loop)
    # ------------------------------------------------------------------ #

    def answer(
        self,
        question: str,
        byok_key: Optional[str] = None,
        byok_provider: Optional[str] = None,
        byok_model: Optional[str] = None,
    ) -> AnswerResult:
        """Run the real RAG pipeline for one question, optionally using a client-provided BYOK key."""
        if self.retriever is None or self.embeddings is None:
            raise PipelineError("Retrieval pipeline is not initialized.")

        llm = self.llm
        effective_model = self.settings.groq_model
        is_using_byok = False
        provider = "groq"

        if byok_key:
            provider = (byok_provider or "").lower().strip()
            if not provider:
                if byok_key.startswith("AIza"):
                    provider = "gemini"
                elif byok_key.startswith("sk-") and not byok_key.startswith("gsk_"):
                    provider = "openai"
                else:
                    provider = "groq"

            try:
                if provider in {"gemini", "google"}:
                    from langchain_google_genai import ChatGoogleGenerativeAI

                    effective_model = (
                        byok_model.strip()
                        if byok_model and byok_model.strip()
                        else "gemini-1.5-flash"
                    )
                    llm = ChatGoogleGenerativeAI(
                        model=effective_model,
                        google_api_key=byok_key,
                        timeout=self.settings.llm_timeout_s,
                    )
                    is_using_byok = True
                elif provider == "openai":
                    from langchain_openai import ChatOpenAI

                    effective_model = (
                        byok_model.strip()
                        if byok_model and byok_model.strip()
                        else "gpt-4o-mini"
                    )
                    llm = ChatOpenAI(
                        model=effective_model,
                        api_key=SecretStr(byok_key) if isinstance(byok_key, str) else byok_key,
                        timeout=self.settings.llm_timeout_s,
                    )
                    is_using_byok = True
                else:
                    from langchain_groq import ChatGroq

                    effective_model = (
                        byok_model.strip()
                        if byok_model and byok_model.strip()
                        else self.settings.groq_model
                    )
                    llm = ChatGroq(
                        model=effective_model,
                        api_key=SecretStr(byok_key) if isinstance(byok_key, str) else byok_key,
                        timeout=self.settings.llm_timeout_s,
                    )
                    is_using_byok = True
            except Exception as exc:  # noqa: BLE001
                if self.llm is not None:
                    log.warning("Failed to init BYOK LLM (%s), falling back to server LLM: %s", provider, exc)
                    llm = self.llm
                    effective_model = self.settings.groq_model
                    is_using_byok = False
                else:
                    raise PipelineError(f"Failed to initialize BYOK LLM ({provider}): {_safe_error(exc)}") from exc

        if llm is None:
            raise PipelineError("LLM provider is not configured.")

        from langchain_core.prompts import ChatPromptTemplate

        prompt = ChatPromptTemplate.from_messages(
            [("system", SYSTEM_PROMPT), ("human", HUMAN_PROMPT)]
        )

        t0 = time.perf_counter()
        docs = self.retriever.invoke(question)
        retrieval_ms = int((time.perf_counter() - t0) * 1000)

        if not docs:
            # Preserve the original pipeline's outcome for empty retrieval:
            # the assistant states the answer is not in the indexed sources.
            return AnswerResult(
                answer=FALLBACK_MESSAGE,
                sources=[],
                chunks_retrieved=0,
                retrieval_ms=retrieval_ms,
                generation_ms=0,
                model=effective_model,
            )

        context = "\n\n".join(doc.page_content for doc in docs)
        final_prompt = prompt.invoke({"context": context, "question": question})
        t1 = time.perf_counter()
        try:
            response = llm.invoke(final_prompt)
        except Exception as exc:
            # If personal BYOK fails (e.g. auth rejected), but server LLM is available,
            # gracefully fall back to server LLM so the user is never blocked!
            if is_using_byok and self.llm is not None:
                log.warning("Personal BYOK call failed (%s), falling back to server LLM: %s", provider, exc)
                try:
                    response = self.llm.invoke(final_prompt)
                    effective_model = self.settings.groq_model
                except Exception:
                    raise exc
            else:
                raise exc
        generation_ms = int((time.perf_counter() - t1) * 1000)

        content = getattr(response, "content", None)
        if not isinstance(content, str):
            raise PipelineError("Model returned an unexpected response type.")

        sources = [document_to_source(doc) for doc in docs]
        return AnswerResult(
            answer=content.strip(),
            sources=sources,
            chunks_retrieved=len(docs),
            retrieval_ms=retrieval_ms,
            generation_ms=generation_ms,
            model=effective_model,
        )

    # ------------------------------------------------------------------ #
    # Retrieval trace (real values only; no LLM call involved)
    # ------------------------------------------------------------------ #

    def trace(self, question: str) -> dict[str, Any]:
        """Produce a full retrieval trace with real embeddings and PCA."""
        if self.embeddings is None or self.vectorstore is None:
            raise PipelineError("Retrieval pipeline is not initialized.")
        if self.state.vector_store_state in {"missing", "empty", "error"}:
            return {"status": "empty", "detail": f"Vector store is {self.state.vector_store_state}."}

        import numpy as np

        try:
            from app.services.vector_math import cosine_similarity_matrix, pca_project_3d
        except ImportError:
            from .vector_math import cosine_similarity_matrix, pca_project_3d

        timings: dict[str, Optional[int]] = {}
        t0 = time.perf_counter()

        query_vec = np.asarray(self.embeddings.embed_query(question), dtype=float)
        timings["embedding_ms"] = int((time.perf_counter() - t0) * 1000)

        t1 = time.perf_counter()
        try:
            candidates = self.vectorstore.similarity_search_by_vector(
                query_vec.tolist(), k=self.settings.retriever_fetch_k
            )
        except Exception as exc:  # noqa: BLE001
            raise PipelineError(f"Candidate search failed: {_safe_error(exc)}") from exc
        timings["candidate_search_ms"] = int((time.perf_counter() - t1) * 1000)

        if not candidates:
            return {"status": "empty", "detail": "No candidates returned for this question."}

        t2 = time.perf_counter()
        selected = self.vectorstore.max_marginal_relevance_search_by_vector(
            query_vec.tolist(),
            k=self.settings.retriever_k,
            fetch_k=self.settings.retriever_fetch_k,
            lambda_mult=self.settings.retriever_lambda_mult,
        )
        timings["mmr_selection_ms"] = int((time.perf_counter() - t2) * 1000)

        t3 = time.perf_counter()
        candidate_vecs = np.asarray(
            self.embeddings.embed_documents([d.page_content for d in candidates]), dtype=float
        )
        all_vecs = np.vstack([query_vec[None, :], candidate_vecs])
        projections = pca_project_3d(all_vecs)
        sims = cosine_similarity_matrix(query_vec[None, :], candidate_vecs)[0]
        timings["projection_ms"] = int((time.perf_counter() - t3) * 1000)
        timings["total_ms"] = int((time.perf_counter() - t0) * 1000)

        # Match MMR-selected chunks back to the candidate pool (content+source).
        selected_keys = {
            (_meta_source(d), getattr(d, "page_content", "")) for d in selected
        }

        # Real context-construction metrics (what a chat request would send).
        context = "\n\n".join(d.page_content for d in selected)

        trace_candidates = []
        for idx, doc in enumerate(candidates):
            meta = doc.metadata or {}
            trace_candidates.append(
                {
                    "document": Path(str(meta.get("source", "unknown"))).name,
                    "page": _clean_page(meta.get("page")),
                    "preview": (doc.page_content or "")[:280],
                    "similarity": round(float(sims[idx]), 4),
                    "selected_by_mmr": (_meta_source(doc), doc.page_content) in selected_keys,
                    "projection": [round(float(v), 4) for v in projections[idx + 1]],
                }
            )

        return {
            "status": "ok",
            "query_embedding_dim": int(query_vec.shape[0]),
            "query_point": [round(float(v), 4) for v in projections[0]],
            "candidates": trace_candidates,
            "context_chars": len(context),
            "context_preview": context[:600],
            "timings": timings,
            "mmr_params": {
                "k": self.settings.retriever_k,
                "fetch_k": self.settings.retriever_fetch_k,
                "lambda_mult": self.settings.retriever_lambda_mult,
            },
            "notes": [
                "3D positions are a PCA projection of the real embedding vectors; "
                "the original space is high-dimensional, so distances are approximate.",
                "Similarity is the cosine similarity between the question embedding "
                "and each chunk embedding.",
                "MMR selection re-ranks the candidate pool for relevance/diversity "
                "trade-off (lambda_mult).",
            ],
        }

    # ------------------------------------------------------------------ #
    # Stats
    # ------------------------------------------------------------------ #

    def source_chunk_counts(self) -> dict[str, dict[str, Any]]:
        """Aggregate real chunk counts + last ingestion time per source."""
        if self.vectorstore is None:
            return {}
        try:
            data = self.vectorstore.get(include=["metadatas"])
        except Exception:  # noqa: BLE001 - stats are best-effort
            log.exception("Failed to read collection metadata for stats")
            return {}
        stats: dict[str, dict[str, Any]] = {}
        for meta in data.get("metadatas") or []:
            if not meta:
                continue
            name = Path(str(meta.get("source", "unknown"))).name
            entry = stats.setdefault(name, {"chunks": 0, "last": None})
            entry["chunks"] += 1
            stamp = meta.get("ingested_at")
            if isinstance(stamp, str) and (entry["last"] is None or stamp > entry["last"]):
                entry["last"] = stamp
        return stats


def _meta_source(doc: Any) -> str:
    meta = getattr(doc, "metadata", None) or {}
    return str(meta.get("source", ""))


def _clean_page(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def document_to_source(doc: Any) -> dict[str, Any]:
    """Extract safe source metadata from a retrieved Document."""
    meta = getattr(doc, "metadata", None) or {}
    source = str(meta.get("source", "unknown"))
    return {
        "document": Path(source).name,
        "page": _clean_page(meta.get("page")),
        "content_preview": (getattr(doc, "page_content", "") or "")[:280],
    }


def _safe_error(exc: Exception) -> str:
    """A short, secret-free description of an exception."""
    text = f"{type(exc).__name__}: {exc}"
    return text[:300]


def classify_provider_error(
    exc: Exception,
    is_byok: bool = False,
    provider: str = "groq",
) -> tuple[int, str, str]:
    """Map a pipeline/provider exception to (status_code, code, message).

    Keeps provider internals out of the response while giving actionable
    messages for the common failure modes (rate limits, timeouts, auth).
    """
    name = type(exc).__name__.lower()
    text = str(exc).lower()
    status_code = getattr(exc, "status_code", None)
    if status_code is None and hasattr(exc, "response"):
        resp_obj = getattr(exc, "response", None)
        status_code = getattr(resp_obj, "status_code", None)
    if status_code is None:
        status_code = getattr(exc, "code", None)

    if provider.lower() in {"gemini", "google"}:
        provider_name = "Google Gemini"
    elif provider.lower() == "openai":
        provider_name = "OpenAI"
    else:
        provider_name = "Groq"

    if status_code == 429 or "rate" in name or "rate_limit" in text:
        return 429, "rate_limited", f"The {provider_name} API is rate-limiting requests. Please wait a moment and try again."
    if status_code == 401 or "auth" in name or "api key" in text or "unauthorized" in text:
        if is_byok:
            return 502, "byok_auth_error", f"Your personal {provider_name} API key was rejected by the provider. Please verify or update your key in Settings (BYOK)."
        return 502, "provider_auth_error", "The LLM provider rejected the server API key. Provide your own key in Settings (BYOK) or check GROQ_API_KEY in backend/.env."
    if "timeout" in name or "timed out" in text:
        return 504, "provider_timeout", f"The {provider_name} API took too long to respond. Try again in a moment."
    if "model" in text and ("not found" in text or "does not exist" in text or "decommission" in text):
        return 502, "model_unavailable", f"The configured model is not available for this {provider_name} account. Please select another model in Settings."
    return 500, "pipeline_error", "The RAG pipeline failed to answer this question. Check the server logs for details."
