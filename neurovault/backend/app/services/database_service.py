"""Document discovery, ingestion and re-indexing.

Ingestion reuses the exact chunking parameters of the original
`createdatabase.py` (RecursiveCharacterTextSplitter, chunk_size=1000,
overlap=200) and writes into the same persistent Chroma collection.

Only explicitly supported document types are accepted (.pdf / .txt / .md);
project files such as `pyvenv.cfg` are never indexed. Re-indexing first
deletes the chunks of the target source so the collection never contains
duplicates.
"""
from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from app.config import PROJECT_ROOT, Settings
from app.schemas import DocumentInfo

log = logging.getLogger("neurovault.database")

INGEST_LOCK = threading.Lock()  # serialises all Chroma writes


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# --------------------------------------------------------------------------- #
# Document discovery
# --------------------------------------------------------------------------- #


def _pdf_page_count(path: Path) -> Optional[int]:
    """Best-effort page count; never raises."""
    try:
        from pypdf import PdfReader

        return len(PdfReader(str(path)).pages)
    except Exception:  # noqa: BLE001 - metadata only
        return None


def _scan_dir(directory: Path) -> dict[str, Path]:
    """Return {filename: path} for supported files in *directory*."""
    found: dict[str, Path] = {}
    if not directory.is_dir():
        return found
    for entry in sorted(directory.iterdir()):
        if entry.is_file() and entry.suffix.lower() in ALLOWED_EXTS:
            found[entry.name] = entry
    return found


ALLOWED_EXTS: set[str] = {".pdf", ".txt", ".md"}


def list_documents(settings: Settings, source_stats: dict[str, dict[str, Any]]) -> list[DocumentInfo]:
    """Merge files on disk with what is actually indexed in Chroma."""
    docs: dict[str, DocumentInfo] = {}

    def chunks_of(name: str) -> int:
        return int(source_stats.get(name, {}).get("chunks", 0))

    def last_of(name: str) -> Optional[str]:
        val = source_stats.get(name, {}).get("last")
        return val if isinstance(val, str) else None

    scan_targets: list[tuple[str, Path]] = [
        ("documents_dir", settings.documents_path),
        ("uploads_dir", settings.uploads_path),
    ]
    parent_docs = (PROJECT_ROOT.parent / settings.documents_dir).resolve()
    if parent_docs.is_dir() and parent_docs != settings.documents_path.resolve():
        scan_targets.append(("documents_dir", parent_docs))

    for label, directory in scan_targets:
        for name, path in _scan_dir(directory).items():
            info = DocumentInfo(
                name=name,
                file_type=path.suffix.lower().lstrip("."),
                size_bytes=path.stat().st_size,
                page_count=_pdf_page_count(path) if path.suffix.lower() == ".pdf" else None,
                indexed=chunks_of(name) > 0,
                chunk_count=chunks_of(name),
                last_ingested_at=last_of(name),
                origin=label,  # type: ignore[arg-type]
            )
            existing = docs.get(name)
            # Prefer the entry that is indexed / has more metadata.
            if existing is None or (info.indexed and not existing.indexed):
                docs[name] = info

    # Sources that exist only in the vector store (e.g. indexed elsewhere).
    for source, entry in source_stats.items():
        if source not in docs:
            docs[source] = DocumentInfo(
                name=source,
                file_type=Path(source).suffix.lower().lstrip(".") or "unknown",
                indexed=True,
                chunk_count=int(entry.get("chunks", 0)),
                last_ingested_at=entry.get("last") if isinstance(entry.get("last"), str) else None,
                origin="indexed_only",
            )
    return sorted(docs.values(), key=lambda d: (not d.indexed, d.name.lower()))


# --------------------------------------------------------------------------- #
# Loading & splitting
# --------------------------------------------------------------------------- #


def load_document(path: Path) -> list[Any]:
    """Load a supported document into LangChain Documents (lazy imports)."""
    ext = path.suffix.lower()
    if ext == ".pdf":
        try:
            from langchain_community.document_loaders import PyPDFLoader
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError("pypdf / langchain-community is not installed.") from exc
        loader = PyPDFLoader(str(path))
        return loader.load()
    if ext in {".txt", ".md"}:
        try:
            from langchain_community.document_loaders import TextLoader
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError("langchain-community is not installed.") from exc
        loader = TextLoader(str(path), encoding="utf-8", autodetect_encoding=True)
        return loader.load()
    raise ValueError(f"Unsupported document type: {ext}")


def split_documents(settings: Settings, documents: list[Any]) -> list[Any]:
    from langchain_text_splitters import RecursiveCharacterTextSplitter

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
    )
    return splitter.split_documents(documents)


# --------------------------------------------------------------------------- #
# Ingestion
# --------------------------------------------------------------------------- #


class IngestionError(Exception):
    """Raised when ingestion cannot proceed or fails."""


def ingest_path(settings: Settings, rag: Any, path: Path) -> dict[str, Any]:
    """Ingest one file into the persistent store. Thread-safe, idempotent metadata."""
    ext = path.suffix.lower()
    if ext not in settings.allowed_ext_list or ext not in ALLOWED_EXTS:
        raise IngestionError(f"Unsupported document type '{ext}'. Allowed: pdf, txt, md.")
    if not path.is_file():
        raise IngestionError(f"File not found: {path.name}")

    with INGEST_LOCK:
        documents = load_document(path)
        if not documents:
            raise IngestionError("No content could be extracted from this document.")
        pages = len(documents)
        chunks = split_documents(settings, documents)
        if not chunks:
            raise IngestionError("Document produced no text chunks.")

        # Normalise metadata: basename only (never leak absolute paths) +
        # ingestion timestamp for the knowledge library.
        stamp = utc_now_iso()
        for chunk in chunks:
            meta = chunk.metadata or {}
            meta["source"] = Path(str(meta.get("source", path.name))).name
            meta["ingested_at"] = stamp
            chunk.metadata = meta

        import gc

        ids: list[str] = []
        batch_size = 32
        for i in range(0, len(chunks), batch_size):
            batch = chunks[i : i + batch_size]
            try:
                batch_ids = rag.vectorstore.add_documents(batch)
                ids.extend(batch_ids)
            except Exception as exc:  # noqa: BLE001
                log.exception("Chroma add_documents failed for %s (batch %d-%d)", path.name, i, i + len(batch))
                raise IngestionError(f"Vector store rejected the document: {exc}") from exc
            gc.collect()

        try:
            rag.state.vector_store_chunks = rag.vectorstore._collection.count()
        except Exception:
            rag.state.vector_store_chunks += len(ids)

        if rag.state.vector_store_chunks > 0:
            rag.state.vector_store_state = "ready"
        # The overall app status may improve (empty store -> ready).
        refresh = getattr(rag, "refresh_overall_status", None)
        if callable(refresh):
            refresh()
        log.info("Ingested %s: %d pages -> %d chunks", path.name, pages, len(ids))
        return {"chunks_added": len(ids), "pages": pages, "ingested_at": stamp}


def reindex_source(settings: Settings, rag: Any, source: str) -> dict[str, Any]:
    """Delete existing chunks for *source*, then re-ingest the file on disk.

    Safe against duplicate chunks: deletion happens first, inside the same
    lock as the re-ingestion.
    """
    safe_name = Path(source).name  # prevent path traversal via metadata
    with INGEST_LOCK:
        try:
            rag.vectorstore._collection.delete(where={"source": safe_name})  # noqa: SLF001
        except Exception as exc:  # noqa: BLE001
            raise IngestionError(f"Could not remove old chunks for '{safe_name}': {exc}") from exc
        log.info("Deleted old chunks for %s", safe_name)

    candidates = [
        settings.documents_path / safe_name,
        settings.uploads_path / safe_name,
        (PROJECT_ROOT.parent / settings.documents_dir) / safe_name,
    ]
    path = next((p for p in candidates if p.is_file()), None)
    if path is None:
        raise IngestionError(
            f"'{safe_name}' is not present on disk anymore; re-indexing requires the original file."
        )
    return ingest_path(settings, rag, path)


def save_upload(settings: Settings, filename: str, payload: bytes) -> Path:
    """Persist an uploaded file into the uploads directory (sanitised name)."""
    settings.uploads_path.mkdir(parents=True, exist_ok=True)
    safe_name = Path(filename).name  # strip any directory components
    if not safe_name or safe_name.startswith("."):
        raise IngestionError("Invalid file name.")
    target = settings.uploads_path / safe_name
    target.write_bytes(payload)
    return target


def auto_seed_empty_store(settings: Settings, rag: Any) -> int:
    """If Chroma is empty, auto-ingest documents from documents_dir and uploads_dir."""
    if not getattr(settings, "auto_seed_on_startup", True):
        log.info("Auto-seed is disabled by settings.")
        return 0

    try:
        count = rag.vectorstore._collection.count()
    except Exception:
        count = getattr(rag.state, "vector_store_chunks", 0)

    if count > 0:
        log.info("Chroma store already contains %d chunks; skipping auto-seed.", count)
        return 0

    log.info("Chroma collection is empty (0 chunks). Auto-seeding initial documents...")
    total_added = 0
    scan_targets = [settings.documents_path, settings.uploads_path]
    parent_docs = (PROJECT_ROOT.parent / settings.documents_dir).resolve()
    if parent_docs.is_dir() and parent_docs != settings.documents_path.resolve():
        scan_targets.append(parent_docs)

    MAX_AUTO_SEED_FILE_BYTES = 250 * 1024  # 250 KB limit during boot auto-seeding
    seen: set[str] = set()
    for directory in scan_targets:
        if not directory.is_dir():
            continue
        for name, path in _scan_dir(directory).items():
            if name in seen:
                continue
            seen.add(name)
            # Skip large documents during startup auto-seed to stay within cloud RAM limits (e.g. Render 512MB)
            try:
                size = path.stat().st_size
                if size > MAX_AUTO_SEED_FILE_BYTES:
                    log.info(
                        "Auto-seed skipping large document '%s' (%.1f KB > %.1f KB limit) on startup. Available in Knowledge Library for on-demand indexing.",
                        name,
                        size / 1024,
                        MAX_AUTO_SEED_FILE_BYTES / 1024,
                    )
                    continue
            except Exception:
                pass
            try:
                res = ingest_path(settings, rag, path)
                added = res.get("chunks_added", 0)
                total_added += added
                log.info("Auto-seeded %s: %d chunks added", name, added)
            except Exception as exc:
                log.warning("Auto-seed skipped %s due to error: %s", name, exc)

    log.info("Auto-seed completed. Total chunks added: %d", total_added)
    return total_added

