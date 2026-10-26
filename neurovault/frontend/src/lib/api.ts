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

export const PRODUCTION_RENDER_BACKEND = "https://neurovault-rag.onrender.com";

export function isLocalhost(): boolean {
  if (typeof window === "undefined") return true;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "";
}

export function getApiBaseUrl(): string {
  // 1. Environment variable override from build (e.g. Vercel Project Settings)
  const envBase = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "").trim().replace(/\/$/, "");
  if (envBase) {
    if (!envBase.startsWith("http://") && !envBase.startsWith("https://") && !envBase.startsWith("/")) {
      return `https://${envBase}`;
    }
    return envBase;
  }

  // 2. Custom override from settings (for developer debugging only)
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem("nv.settings.v1") : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.apiUrl && typeof parsed.apiUrl === "string") {
        const val = parsed.apiUrl.trim().replace(/\/$/, "");
        // Clean out stale placeholders
        if (val && val !== "https://your-service.onrender.com") {
          // Prevent stale localhost URLs saved in browser from breaking deployed Vercel frontend
          if (!isLocalhost() && (val.includes("localhost") || val.includes("127.0.0.1"))) {
            // ignore localhost override on cloud deployment
          } else {
            return val;
          }
        }
      }
    }
  } catch {
    /* fallback to auto-detection */
  }

  // 3. Zero-config production deployment auto-connect:
  // When running on Vercel (*.vercel.app), vercel.json proxies /api/* to Render seamlessly.
  // Using relative path "" avoids browser CORS preflight restrictions, while falling back to direct Render.
  if (!isLocalhost()) {
    if (typeof window !== "undefined" && window.location.hostname.endsWith(".vercel.app")) {
      return "";
    }
    return PRODUCTION_RENDER_BACKEND;
  }

  // 4. Local development: use relative path "" (Vite dev proxy forwards to http://127.0.0.1:8000)
  return "";
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

function endpointUrl(path: string, baseOverride?: string): string {
  const base = baseOverride !== undefined ? baseOverride : getApiBaseUrl();
  let url = `${base}${path}`;
  if (GATEWAY_PORT) {
    url += (url.includes("?") ? "&" : "?") + `XTransformPort=${GATEWAY_PORT}`;
  }
  return url;
}

/** Extract a clean, user-safe message from a backend error response without exposing internal infrastructure details. */
function toApiError(status: number, payload: unknown, isColdStart = false): ApiError {
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

  if (status === 502 || status === 503 || status === 504 || isColdStart) {
    return new ApiError({
      status: status || 503,
      code: "service_waking_up",
      message: "Waking up the service (this may take up to a minute on initial start). Please try again in a few moments.",
    });
  }

  if (status === 404) {
    return new ApiError({
      status: 404,
      code: "service_unavailable",
      message: "The AI service is temporarily unavailable. Please try again in a moment.",
    });
  }

  return new ApiError({ status, code: "error", message: `Request could not be completed (status ${status}). Please try again.` });
}

interface RequestOptions extends RequestInit {
  retries?: number;
  retryDelayMs?: number;
}

async function request<T>(path: string, options?: RequestOptions): Promise<T> {
  const isGet = !options?.method || options.method.toUpperCase() === "GET";
  // Only retry idempotent GET queries automatically to prevent duplicate state-changing operations
  const maxRetries = options?.retries !== undefined ? options.retries : (isGet ? 2 : 0);
  const baseDelay = options?.retryDelayMs ?? 1500;

  const currentBase = getApiBaseUrl();
  const fallbackBases = !isLocalhost()
    ? [PRODUCTION_RENDER_BACKEND, ""]
    : ["", "http://127.0.0.1:8000", PRODUCTION_RENDER_BACKEND];

  let attempt = 0;
  let lastError: unknown = null;
  let isColdStartDetected = false;

  while (attempt <= maxRetries) {
    const targetBases = attempt === 0
      ? [currentBase]
      : Array.from(new Set([currentBase, ...fallbackBases]));

    for (const base of targetBases) {
      const url = endpointUrl(path, base);
      try {
        const res = await fetch(url, options);

        // Render cold start response status codes
        if (res.status === 502 || res.status === 503 || res.status === 504) {
          isColdStartDetected = true;
          if (attempt < maxRetries) {
            break; // sleep and retry with backoff
          }
        }

        // If a static host returned 404 for relative /api/*, try the direct cloud candidate
        if (res.status === 404 && base === "") {
          continue;
        }

        if (res.status === 204) return undefined as T;
        const text = await res.text();
        let payload: unknown = null;
        try {
          payload = text ? JSON.parse(text) : null;
        } catch {
          payload = null;
        }

        if (!res.ok) {
          throw toApiError(res.status, payload, isColdStartDetected);
        }

        if (payload === null) {
          throw new ApiError({
            status: res.status,
            code: "invalid_response",
            message: "The service returned an unreadable response. Please try again.",
          });
        }

        return payload as T;
      } catch (err) {
        lastError = err;
        if (err instanceof ApiError) {
          // If explicit application error (e.g. 400 Bad Request, BYOK auth rejection), bubble up immediately
          if (err.status !== 502 && err.status !== 503 && err.status !== 504 && err.status !== 404) {
            throw err;
          }
        }
      }
    }

    attempt++;
    if (attempt <= maxRetries) {
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  if (lastError instanceof ApiError) {
    throw lastError;
  }

  throw new ApiError({
    status: isColdStartDetected ? 503 : 0,
    code: isColdStartDetected ? "service_waking_up" : "network_error",
    message: isColdStartDetected
      ? "Waking up the service (this may take up to a minute on initial start). Please try again in a moment."
      : "Temporarily unavailable. Please check your connection and try again.",
  });
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
