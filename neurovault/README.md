# NeuroVault — Deep Learning Intelligence Lab

A 3D RAG research workspace that turns your existing Python LangChain project
(HuggingFace embeddings · ChromaDB · MMR retriever · Groq LLM) into an
interactive knowledge lab: ask questions, inspect retrieved evidence, explore
the retrieval pipeline, and manage your document index — grounded answers only,
never fabricated ones.

```
neurovault/
├── backend/                     # FastAPI integration layer (Python)
│   ├── app/
│   │   ├── main.py              # app factory, CORS, error envelope, lifespan
│   │   ├── config.py            # typed settings (.env driven), path resolution
│   │   ├── schemas.py           # Pydantic request/response models
│   │   ├── services/
│   │   │   ├── rag_service.py   # ONE shared pipeline: embeddings, Chroma,
│   │   │   │                    #   MMR retriever, Groq LLM, prompt, trace
│   │   │   ├── database_service.py  # discovery, ingestion, re-index
│   │   │   └── vector_math.py   # cosine similarity + PCA projection
│   │   └── routers/
│   │       ├── health.py        # GET  /api/health
│   │       ├── chat.py          # POST /api/chat
│   │       ├── documents.py     # GET/POST documents, ingest jobs, stats
│   │       └── retrieval.py     # GET config, POST trace
│   ├── tests/                   # pytest suite (real Chroma, mocked providers)
│   ├── requirements.txt
│   └── .env.example
├── frontend/                    # React 18 + TypeScript + Vite
│   └── src/
│       ├── components/neural/   # R3F 3D neural network + static fallback
│       ├── components/ui|layout # design-system primitives, sidebar, topbar
│       ├── features/hero        # "Explore Knowledge. Discover Intelligence."
│       ├── features/chat        # composer, markdown answers, source inspector
│       ├── features/knowledge   # library, drag&drop upload, ingest jobs
│       ├── features/retrieval   # 9-stage pipeline explorer (real timings)
│       ├── features/embeddings  # 3D embedding space (real PCA projection)
│       └── features/settings    # theme, motion, 3D toggles, connection
├── document_loaders/            # your knowledge sources live here
└── .gitignore
```

## What was preserved from your original project

| Original (`main.py` / `createdatabase.py`) | NeuroVault backend |
|---|---|
| `HuggingFaceEmbeddings()` (MiniLM-L6-v2) | Same model & default (`EMBEDDING_MODEL`) |
| `Chroma(persist_directory="chroma_db")` | One configurable `CHROMA_PERSIST_DIRECTORY` — fixes the `Chroma_db` vs `chroma_db` split that silently created an empty store |
| LangChain default collection | `COLLECTION_NAME=langchain` (kept for compatibility with your existing index) |
| MMR `k=4, fetch_k=10, lambda_mult=0.5` | Preserved verbatim (`/api/retrieval/config`) |
| `ChatGroq(model="openai/gpt-oss-120b")` | Preserved verbatim (`GROQ_MODEL`) |
| Chunking `1000 / 200` | Preserved verbatim for ingestion & re-index |
| Context-only grounding prompt | Preserved; fallback wording professionalised, meaning unchanged |
| Terminal `input()` loop | `POST /api/chat` with the identical retrieval → context → LLM flow |

Not uploaded / not inspected: `retrivers/arixv.py` and `vector store/DB.py`
were not provided in this workspace, so nothing was migrated from them and no
behaviour was silently replaced. Share them if you want arXiv ingestion added.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | availability + vector-store/LLM/embedding checks (no secrets) |
| POST | `/api/chat` | real RAG answer + source metadata + timings |
| GET | `/api/documents` | files on disk merged with what is actually indexed |
| POST | `/api/documents/ingest` | multipart upload → background job (202 + job id) |
| GET | `/api/documents/ingest/jobs/{id}` | job status (poll for completion) |
| POST | `/api/documents/reindex` | safe delete-then-add per source (no duplicates) |
| GET | `/api/retrieval/config` | strategy, k/fetch_k/λ, chunking, providers |
| POST | `/api/retrieval/trace` | real embedding → candidate search → MMR → PCA |
| GET | `/api/stats` | chunk counts per source from the live collection |

Errors use `{"detail": {"code": "...", "message": "..."}}` with honest status
codes: `503 empty_vector_store`, `503 provider_not_configured`, `429
rate_limited`, `504 provider_timeout`, `415 unsupported_type`, `413
file_too_large`. CORS is restricted to `CORS_ORIGINS`.

## Installation (Windows PowerShell)

Prerequisites: Python 3.10+, Node.js 18+, and a Groq API key.

```powershell
cd neurovault

# ---------- 1. Backend ----------
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install torch --index-url https://download.pytorch.org/whl/cpu   # optional, smaller wheel
pip install -r requirements.txt

Copy-Item .env.example .env
notepad .env          # set GROQ_API_KEY=gsk_...

# ---------- 2. Frontend (new terminal) ----------
cd ..\frontend
npm install

# ---------- 3. Run ----------
# Terminal 1 (backend, from backend\ with venv active):
uvicorn app.main:app --host 0.0.0.0 --port 8000

# Terminal 2 (frontend, from frontend\):
npm run dev           # → http://localhost:5173
```

Open **http://localhost:5173** → the hero dashboard should show
“Backend online”. Ask a question or use the example chips.

### Rebuilding your index

Your existing `chroma_db\` is opened as-is (never rebuilt). To (re)create it
from the documents in `document_loaders\`, either upload them in the Knowledge
Library UI, or run the ingestion once:

```powershell
# from backend\ with the venv active and documents in ..\document_loaders
python -c "from app.config import get_settings; from app.services.rag_service import RAGService; from app.services.database_service import ingest_path; import pathlib; s=get_settings(); r=RAGService(s); r.initialize(); [ingest_path(s, r, pathlib.Path(p)) for p in pathlib.Path(s.documents_path).glob('*') if p.suffix.lower() in ('.pdf','.txt','.md')]"
```

## Tests & verification

```powershell
# backend (from backend\): real Chroma, mocked providers — no API key needed
pytest

# frontend (from frontend\)
npm run typecheck
npm run test

# end-to-end against the real running backend (from anywhere):
python ..\scripts\verify_e2e.py    # set NEUROVAULT_BASE_URL to override host
```

The E2E script checks health, document inventory and a real retrieval trace;
it exercises a real Groq chat completion only when `GROQ_API_KEY` is present.

### Verification checklist

- [ ] `/api/health` returns `status: ready` and `vector_store.state: ready`
- [ ] Hero stats show your real document/chunk counts
- [ ] Example chip in the hero sends a real request and lands in the workspace
- [ ] Answer shows sources with document + page; expanding reveals the chunk text
- [ ] Retrieval Explorer shows real embedding dim (384 for MiniLM) and timings
- [ ] Embedding Space labels points as “real embeddings (PCA)”
- [ ] Upload a small `.txt` in the Knowledge Library → job completes → chunks counted
- [ ] Re-index keeps the total chunk count stable (no duplicates)
- [ ] With `GROQ_API_KEY` removed: chat shows a clear “not configured” error, retrieval still works

## Design & honesty guarantees

- The 3D network is an **educational visualization** (5-9-13-9-4 layers) — it
  does not depict Groq model internals; node inspector explains each layer.
- The Embedding Space uses **real embeddings** projected with PCA (labelled as
  an approximation) when a trace has run; otherwise an explicitly-labelled
  conceptual illustration.
- The pipeline explorer marks stages as **runtime** (measured) or
  **explanation** (informational). LLM generation timings come only from real
  chat requests.
- No retrieval score is shown in chat answers (the MMR retriever does not
  expose one); the trace view computes real cosine similarities instead.
- Conversations live in `localStorage` only, labelled “stored locally”.
- Provider secrets stay in backend `.env`; the browser only ever receives a
  boolean “configured”.

## Troubleshooting

| Symptom | Cause & fix |
|---|---|
| “Backend offline” pill | uvicorn not running, or wrong port. `curl http://127.0.0.1:8000/api/health` |
| `503 empty_vector_store` | No chunks indexed yet — ingest via the Knowledge Library |
| `503 provider_not_configured` | `GROQ_API_KEY` missing in backend `.env`; restart after editing |
| `502 model_unavailable` | Your Groq account lacks `openai/gpt-oss-120b` — set `GROQ_MODEL` to a model you have (e.g. `llama-3.3-70b-versatile`) |
| `429 rate_limited` | Groq free-tier rate limit — wait and retry |
| Embedding model download fails on first start | It downloads once (~90 MB) into the HF cache; set `HF_HOME` to a writable dir or keep the ONNX fallback (automatic) |
| First chat is slow | Embedding model loads once at startup; subsequent requests are fast |
| PowerShell blocks venv activation | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| Port 8000 busy | `uvicorn app.main:app --port 8001` and set `VITE_API_BASE_URL=http://localhost:8001` for the frontend |
| Windows path mixups (`Chroma_db`) | Old folder from the original `main.py` bug can be deleted after confirming `chroma_db\` holds your data |

## Notes on degraded mode

Without `GROQ_API_KEY` the lab still runs: health, document library,
ingestion, retrieval traces and the 3D visualizations all work against the
real store; chat returns the documented `provider_not_configured` error
instead of pretending to answer.
