# Worklog

---
Task ID: 1
Agent: main (Z.ai)
Task: Build NeuroVault — 3D Deep Learning RAG Knowledge Lab (React+Vite frontend, FastAPI backend wrapping existing LangChain pipeline)

Work Log:
- Phase 1 audit: inspected /home/z/my-project/upload/main.py + createdatabase.py. Found: Chroma_db/chroma_db path inconsistency (silent empty store bug), terminal chat loop, Hinglish fallback message. retrivers/arixv.py and vector store/DB.py were NOT provided — not migrated, noted in README.
- Phase 2 backend: built neurovault/backend (FastAPI + pydantic-settings). config.py resolves paths from project root; rag_service.py owns ONE shared pipeline (HuggingFaceEmbeddings/MiniLM, Chroma "langchain" collection, MMR k=4/fetch_k=10/λ=0.5, ChatGroq openai/gpt-oss-120b, grounded prompt with professionalised fallback); database_service.py (ingest 1000/200, re-index = delete-then-add under one lock, sanitized filenames); routers: health, chat, documents(+background ingest jobs), retrieval(config+trace), stats. Real retrieval trace: embed → candidates → MMR → cosine sims → PCA 3D projection. All timings measured, no fabricated values.
- Added ONNX MiniLM embedding fallback (same 384-dim model, no torch) for constrained envs; fixed np.float32 → float conversion bug caught by E2E.
- Phase 3 frontend: neurovault/frontend (React 18 + TS strict + Vite + Tailwind + framer-motion + R3F/drei + react-markdown/rehype-highlight). Views: Hero (3D scene, example chips, real stats), Chat workspace (composer Enter/Shift+Enter, markdown, sources accordion, follow-ups, regenerate, right intelligence panel with real config), Knowledge Library (drag&drop upload with XHR progress, job polling, filters, re-index), Retrieval Explorer (9 stages, runtime vs explanation badges), 3D Embedding Space (real PCA mode + labelled conceptual fallback), Settings (theme/3D/motion/sidebar, honest backend status). SVG fallback when WebGL unavailable; reduced-motion respected.
- Tests: backend pytest 28/28 passed (real Chroma + fake embeddings/LLM); frontend vitest 6/6 passed; tsc --noEmit clean; vite build clean with vendor chunking.
- E2E: scripts/verify_e2e.py against real backend — ingest via real API (5 chunks, 2s), trace real 384-dim embeddings (embedding 42ms, MMR 2ms), chat 503 provider_not_configured (honest, no GROQ_API_KEY in sandbox). E2E_RC=0.
- Sandbox preview: frontend built with base=/preview/, served by FastAPI StaticFiles; Next.js gateway routes (src/app/api/[...path], src/app/preview/[[...path]]) proxy to port 8000; backend runs as mini-services/neurovault-backend (survives across sessions); launcher page redirects to /preview/.
- agent-browser verification: hero renders with live 3D scene + real stats; example chip → chat with honest provider_not_configured alert + Retry; Knowledge Library shows 1 doc/5 chunks; Retrieval Explorer trace shows runtime badges, 384 dims, 5 candidates, MMR 4 picks with real cosine sims, 2145-char context; Embedding Space shows "real embeddings (PCA)" with labelled points; no horizontal overflow at 390px; desktop 1440px screenshots look premium.

Stage Summary:
- Deliverable: /home/z/my-project/neurovault/ (backend + frontend + README + .env.example + .gitignore + document_loaders/deep_learning_notes.txt sample)
- Windows PowerShell runbook + verification checklist in README.md
- Sandbox: uvicorn on :8000 via mini-service; preview via gateway /preview/
- Known limitation: chat answers require user's GROQ_API_KEY (not present in sandbox); everything else verified live
