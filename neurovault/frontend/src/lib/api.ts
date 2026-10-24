/** Centralized API client. Every backend call goes through here. */
import type {
  ApiErrorShape,
  ChatRequest,
  ChatResponse,
  DocumentsResponse,
  HealthResponse,
  IngestAccepted,
  IngestJobStatus,
  ReindexRequest,
  RetrievalConfigResponse,
  StatsResponse,
  TraceRequest,
  TraceResponse,
} from "@/types";

export function getApiBaseUrl(): string {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem("nv.settings.v1") : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.apiUrl && typeof parsed.apiUrl === "string" && parsed.apiUrl.trim()) {
        return parsed.apiUrl.trim().replace(/\/$/, "");
      }
    }
  } catch {
    /* fallback to env */
  }
  return ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "").replace(/\/$/, "");
}

// Sandbox gateway mode: a fixed extra query parameter routes /api calls to the
// Python backend port through the platform gateway. Undefined in normal use.
const GATEWAY_PORT = (import.meta.env.VITE_API_GATEWAY_PORT as string | undefined) ?? "";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(shape: ApiErrorShape) {
    super(shape.message);
    this.name = "ApiError";
    this.status = shape.status;
    this.code = shape.code;
  }
}

function endpointUrl(path: string): string {
  const base = getApiBaseUrl();
  let url = `${base}${path}`;
  if (GATEWAY_PORT) {
    url += (url.includes("?") ? "&" : "?") + `XTransformPort=${GATEWAY_PORT}`;
  }
  return url;
}

/** Extract a clean, user-safe message from a FastAPI error response. */
function toApiError(status: number, payload: unknown): ApiError {
  const anyPayload = payload as Record<string, unknown> | null;
  // FastAPI HTTPException with dict detail: {detail: {code, message}}
  const detail = anyPayload?.detail;
  if (detail && typeof detail === "object" && "message" in (detail as Record<string, unknown>)) {
    const d = detail as Record<string, unknown>;
    return new ApiError({
      status,
      code: String(d.code ?? "error"),
      message: String(d.message ?? "Request failed."),
    });
  }
  if (typeof detail === "string") {
    return new ApiError({ status, code: "error", message: detail });
  }
  // RFC error envelope: {error: {code, message}}
  const err = anyPayload?.error;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    return new ApiError({
      status,
      code: String(e.code ?? "error"),
      message: String(e.message ?? "Request failed."),
    });
  }
  // Validation errors: [{loc, msg}]
  if (Array.isArray(detail)) {
    const first = detail[0] as { msg?: string } | undefined;
    return new ApiError({ status, code: "validation_error", message: first?.msg ?? "Invalid request." });
  }
  if (status === 404) {
    const currentBase = getApiBaseUrl();
    const target = currentBase || "port 8000 (localhost)";
    return new ApiError({
      status,
      code: "not_found",
      message: `Endpoint not found (HTTP 404) at ${target}. Ensure the backend server is running and configured in Settings.`,
    });
  }
  return new ApiError({ status, code: "error", message: `Request failed (HTTP ${status}).` });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(endpointUrl(path), init);
  } catch {
    const currentBase = getApiBaseUrl();
    const target = currentBase || "port 8000";
    throw new ApiError({
      status: 0,
      code: "network_error",
      message:
        `Cannot reach the NeuroVault backend (${target}). Ensure the API server is running or configure the Backend URL in Settings.`,
    });
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!res.ok) throw toApiError(res.status, payload);
  if (payload === null) {
    throw new ApiError({
      status: res.status,
      code: "invalid_response",
      message: text?.trim().startsWith("<")
        ? "Received HTML instead of JSON. Ensure your Backend API URL points to the FastAPI backend (not the static frontend host)."
        : "Received an empty or invalid response from the backend.",
    });
  }
  return payload as T;
}

export const api = {
  health: () => request<HealthResponse>("/api/health"),

  chat: (
    body: ChatRequest,
    byokKey?: string,
    byokProvider?: string,
    byokModel?: string,
  ) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const effectiveByok = byokKey || body.byok_api_key;
    const effectiveProvider = byokProvider || body.byok_provider;
    const effectiveModel = byokModel || body.byok_model;
    if (effectiveByok) {
      headers["X-Byok-Api-Key"] = effectiveByok;
      headers["X-Groq-Api-Key"] = effectiveByok;
      if (effectiveProvider) {
        headers["X-Byok-Provider"] = effectiveProvider;
      }
    }
    return request<ChatResponse>("/api/chat", {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...body,
        byok_api_key: effectiveByok || undefined,
        byok_provider: effectiveProvider || undefined,
        byok_model: effectiveModel || undefined,
      }),
    });
  },

  documents: () => request<DocumentsResponse>("/api/documents"),

  stats: () => request<StatsResponse>("/api/stats"),

  retrievalConfig: () => request<RetrievalConfigResponse>("/api/retrieval/config"),

  trace: (body: TraceRequest) =>
    request<TraceResponse>("/api/retrieval/trace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  ingestJob: (jobId: string) => request<IngestJobStatus>(`/api/documents/ingest/jobs/${jobId}`),

  ingestJobs: () => request<IngestJobStatus[]>("/api/documents/ingest/jobs"),

  reindex: (body: ReindexRequest) =>
    request<IngestAccepted>("/api/documents/reindex", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
};

/**
 * Upload with REAL progress events (fetch cannot report upload progress).
 * Returns the ingest job so the caller can poll for completion.
 */
export function uploadDocument(
  file: File,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<IngestAccepted> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", endpointUrl("/api/documents/ingest"));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let payload: unknown = null;
      try {
        payload = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        payload = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        if (payload && typeof payload === "object") {
          resolve(payload as IngestAccepted);
        } else {
          reject(
            new ApiError({
              status: xhr.status,
              code: "invalid_response",
              message: "Upload succeeded but server returned invalid response format.",
            }),
          );
        }
      } else {
        reject(toApiError(xhr.status, payload));
      }
    };
    xhr.onerror = () =>
      reject(
        new ApiError({
          status: 0,
          code: "network_error",
          message: "Upload failed — cannot reach the backend.",
        }),
      );
    xhr.onabort = () => reject(new DOMException("Upload aborted", "AbortError"));
    if (signal) signal.addEventListener("abort", () => xhr.abort());
    xhr.send(form);
  });
}

export const API_BASE_LABEL = getApiBaseUrl() || "(same origin / default proxy)";
