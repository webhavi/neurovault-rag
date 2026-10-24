/** API contract types — mirror backend/app/schemas.py exactly. */

export type HealthStatus = "ready" | "degraded" | "initializing" | "error";

export interface HealthCheck {
  ok: boolean;
  state: string;
  detail: string | null;
  model: string | null;
  chunks: number | null;
  configured: boolean | null;
}

export interface HealthResponse {
  status: HealthStatus;
  version: string;
  uptime_s: number;
  checks: Record<string, HealthCheck>;
}

export interface ChatMessagePayload {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  question: string;
  session_id?: string | null;
  history?: ChatMessagePayload[] | null;
  byok_api_key?: string | null;
  byok_provider?: string | null;
  byok_model?: string | null;
}

export interface SourceRef {
  document: string;
  page: number | null;
  content_preview: string;
}

export interface RetrievalInfo {
  strategy: string;
  chunks_retrieved: number;
  duration_ms: number | null;
}

export interface ChatResponse {
  answer: string;
  sources: SourceRef[];
  retrieval: RetrievalInfo;
  metadata: {
    duration_ms: number;
    model: string;
    grounded: boolean;
    generation_ms: number | null;
  };
}

export interface DocumentInfo {
  name: string;
  file_type: string;
  size_bytes: number | null;
  page_count: number | null;
  indexed: boolean;
  chunk_count: number;
  last_ingested_at: string | null;
  error: string | null;
  origin: "documents_dir" | "uploads_dir" | "indexed_only";
}

export interface DocumentsResponse {
  documents: DocumentInfo[];
  documents_dir_label: string;
  allowed_extensions: string[];
}

export interface IngestAccepted {
  job_id: string;
  filename: string;
  status: string;
}

export interface IngestJobStatus {
  job_id: string;
  filename: string;
  status: "queued" | "processing" | "completed" | "failed";
  stage: string | null;
  chunks_added: number | null;
  pages: number | null;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
}

export interface RetrievalConfigResponse {
  strategy: string;
  k: number;
  fetch_k: number;
  lambda_mult: number;
  embedding_provider: string;
  embedding_model: string;
  llm_provider: string;
  llm_model: string;
  chunk_size: number;
  chunk_overlap: number;
}

export interface ReindexRequest {
  source: string;
}

export interface TraceRequest {
  question: string;
}

export interface TraceCandidate {
  document: string;
  page: number | null;
  preview: string;
  similarity: number | null;
  selected_by_mmr: boolean;
  projection: number[] | null;
}

export interface TraceTimings {
  embedding_ms: number | null;
  candidate_search_ms: number | null;
  mmr_selection_ms: number | null;
  projection_ms: number | null;
  total_ms: number | null;
}

export interface TraceResponse {
  question: string;
  status: "ok" | "empty" | "unavailable";
  detail: string | null;
  query_embedding_dim: number | null;
  query_point: number[] | null;
  candidates: TraceCandidate[];
  context_chars: number | null;
  context_preview: string | null;
  timings: TraceTimings;
  mmr_params: Record<string, number>;
  notes: string[];
}

export interface DocumentStat {
  source: string;
  chunks: number;
}

export interface StatsResponse {
  status: string;
  total_chunks: number;
  documents: DocumentStat[];
  embedding_model: string;
  llm_model: string;
  retrieval: Record<string, number | string>;
  collection_name: string;
  generated_at: string;
}

/** API error envelope produced by the backend. */
export interface ApiErrorShape {
  status: number;
  code: string;
  message: string;
}
