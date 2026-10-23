/**
 * Knowledge Library — real document inventory merged from disk + the vector
 * store, with drag-and-drop ingestion through the actual backend.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Database,
  FileText,
  FileType2,
  FileWarning,
  History,
  RefreshCw,
  Search,
  UploadCloud,
} from "lucide-react";
import { api, uploadDocument } from "@/lib/api";
import { useToasts } from "@/hooks/useToasts";
import { invalidateStats, useStats } from "@/components/layout/TopBar";
import { Badge, EmptyState, Panel, SectionTitle, Skeleton } from "@/components/ui/Primitives";
import { Button } from "@/components/ui/Button";
import { cn, formatBytes, formatDate } from "@/lib/utils";
import type { DocumentInfo, IngestJobStatus } from "@/types";

type StatusFilter = "all" | "indexed" | "pending";
type TypeFilter = "all" | "pdf" | "txt" | "md";

const UPLOAD_MAX_MB = 25;

export default function KnowledgePage() {
  const [documents, setDocuments] = useState<DocumentInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [dragOver, setDragOver] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [jobs, setJobs] = useState<IngestJobStatus[]>([]);
  const [busySource, setBusySource] = useState<string | null>(null);
  const { push } = useToasts();
  const { stats } = useStats();
  const fileInput = useRef<HTMLInputElement>(null);
  const pollRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.documents();
      setDocuments(res?.documents ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load documents.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* poll active ingestion jobs */
  useEffect(() => {
    const hasActive = jobs.some((j) => j.status === "queued" || j.status === "processing");
    pollRef.current = window.setTimeout(
      async () => {
        try {
          const list = await api.ingestJobs();
          const interesting = list.slice(0, 8);
          const prev = jobs;
          const completedNow = interesting.find(
            (j) => j.status === "completed" && prev.find((p) => p.job_id === j.job_id)?.status !== "completed",
          );
          const failedNow = interesting.find(
            (j) => j.status === "failed" && prev.find((p) => p.job_id === j.job_id)?.status !== "failed",
          );
          setJobs(interesting);
          if (completedNow) {
            push("success", `Ingested ${completedNow.filename}`, `${completedNow.chunks_added} chunks added to the vector store.`);
            void load();
            invalidateStats();
          }
          if (failedNow) {
            push("error", `Failed to ingest ${failedNow.filename}`, failedNow.error ?? undefined);
          }
        } catch {
          /* backend unreachable */
        }
      },
      hasActive ? 900 : 2600,
    );
    return () => {
      if (pollRef.current) window.clearTimeout(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, load, push, invalidateStats]);

  const startUpload = useCallback(
    async (file: File) => {
      const ext = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
      if (!["pdf", "txt", "md"].includes(ext.replace(".", ""))) {
        push("error", "Unsupported file type", `${ext || "unknown"} is not allowed. Use PDF, TXT or MD.`);
        return;
      }
      if (file.size > UPLOAD_MAX_MB * 1024 * 1024) {
        push("error", "File too large", `Maximum upload size is ${UPLOAD_MAX_MB} MB.`);
        return;
      }
      setUploadPct(0);
      try {
        const accepted = await uploadDocument(file, setUploadPct);
        push("info", `Upload complete — ${accepted.filename}`, "Embedding and indexing in progress…");
        setUploadPct(null);
        void load();
      } catch (e) {
        setUploadPct(null);
        push("error", "Upload failed", e instanceof Error ? e.message : "Unknown error.");
      }
    },
    [load, push],
  );

  const reindex = useCallback(
    async (doc: DocumentInfo) => {
      setBusySource(doc.name);
      try {
        const accepted = await api.reindex({ source: doc.name });
        push("info", `Re-indexing ${accepted.filename}`, "Old chunks are being replaced…");
      } catch (e) {
        push("error", "Re-index failed", e instanceof Error ? e.message : "Unknown error.");
      } finally {
        setBusySource(null);
      }
    },
    [push],
  );

  const filtered = useMemo(() => {
    return (documents ?? []).filter((d) => {
      if (query && !d.name.toLowerCase().includes(query.toLowerCase())) return false;
      if (statusFilter === "indexed" && !d.indexed) return false;
      if (statusFilter === "pending" && d.indexed) return false;
      if (typeFilter !== "all" && d.file_type !== typeFilter) return false;
      return true;
    });
  }, [documents, query, statusFilter, typeFilter]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 sm:p-6">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--nv-text)]">Knowledge Library</h2>
          <p className="mt-0.5 text-xs text-[var(--nv-text-muted)]">
            {stats?.documents
              ? `${stats.documents.length} document(s) indexed · ${stats.total_chunks} chunks in the persistent vector store`
              : "Loading index statistics…"}
          </p>
        </div>
        <Button variant="outline" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />} onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {/* upload zone */}
      <Panel
        bright
        className={cn(
          "relative flex flex-col items-center justify-center gap-2 border-dashed px-4 py-8 text-center transition",
          dragOver && "border-[var(--nv-cyan)] bg-[rgba(66,232,245,0.05)]",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const files = Array.from(e.dataTransfer.files ?? []);
          files.slice(0, 5).forEach((f) => void startUpload(f));
        }}
      >
        <UploadCloud className="h-8 w-8 text-[var(--nv-cyan)]" aria-hidden />
        <p className="text-sm font-medium text-[var(--nv-text)]">
          Drag & drop documents here, or{" "}
          <button
            type="button"
            className="text-[var(--nv-cyan)] underline underline-offset-2"
            onClick={() => fileInput.current?.click()}
          >
            browse
          </button>
        </p>
        <p className="text-xs text-[var(--nv-text-muted)]">PDF, TXT, MD · up to {UPLOAD_MAX_MB} MB each</p>
        <input
          ref={fileInput}
          type="file"
          accept=".pdf,.txt,.md"
          multiple
          className="sr-only"
          aria-label="Upload documents"
          onChange={(e) => {
            Array.from(e.target.files ?? []).forEach((f) => void startUpload(f));
            e.target.value = "";
          }}
        />
        {uploadPct != null && (
          <div className="mt-2 w-full max-w-sm" aria-live="polite">
            <div className="h-1.5 overflow-hidden rounded-full bg-[rgba(102,136,190,0.18)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--nv-cyan)] to-[var(--nv-violet)] transition-all"
                style={{ width: `${uploadPct}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] tabular-nums text-[var(--nv-text-muted)]">{uploadPct}% uploaded</p>
          </div>
        )}
      </Panel>

      {/* filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--nv-text-muted)]" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search documents…"
            aria-label="Search documents"
            className="h-9 w-56 rounded-xl border border-[var(--nv-border)] bg-[rgba(15,22,44,0.5)] pl-8 pr-3 text-sm text-[var(--nv-text)] placeholder:text-[var(--nv-text-muted)] focus:border-[var(--nv-cyan)] focus:outline-none"
          />
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Filter by status">
          {(["all", "indexed", "pending"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={cn(
                "h-9 rounded-xl border px-3 text-xs font-medium capitalize transition",
                statusFilter === s
                  ? "border-[var(--nv-cyan)] bg-[rgba(66,232,245,0.08)] text-[var(--nv-text)]"
                  : "border-[var(--nv-border)] text-[var(--nv-text-muted)] hover:text-[var(--nv-text)]",
              )}
              aria-pressed={statusFilter === s}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Filter by type">
          {(["all", "pdf", "txt", "md"] as TypeFilter[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={cn(
                "h-9 rounded-xl border px-3 text-xs font-medium uppercase transition",
                typeFilter === t
                  ? "border-[var(--nv-violet)] bg-[rgba(152,117,255,0.1)] text-[var(--nv-text)]"
                  : "border-[var(--nv-border)] text-[var(--nv-text-muted)] hover:text-[var(--nv-text)]",
              )}
              aria-pressed={typeFilter === t}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* error / loading / grid */}
      {error && (
        <Panel className="border-[rgba(248,113,113,0.4)] p-4">
          <p className="flex items-center gap-2 text-sm text-[var(--nv-danger)]">
            <FileWarning className="h-4 w-4" aria-hidden /> {error}
          </p>
        </Panel>
      )}

      {!documents && !error && (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      )}

      {documents && filtered.length === 0 && (
        <Panel className="p-2">
          <EmptyState
            icon={<Database className="h-6 w-6" aria-hidden />}
            title={query || statusFilter !== "all" || typeFilter !== "all" ? "No documents match the filters" : "No documents found"}
            hint={
              query || statusFilter !== "all" || typeFilter !== "all"
                ? "Adjust the search or filters above."
                : "Upload a PDF, TXT or MD file above — it will be chunked (1000/200), embedded and added to the persistent Chroma store."
            }
          />
        </Panel>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {filtered.map((doc) => (
          <DocumentCard key={`${doc.origin}:${doc.name}`} doc={doc} onReindex={() => void reindex(doc)} busy={busySource === doc.name} />
        ))}
      </div>

      {/* ingestion jobs */}
      {jobs.length > 0 && (
        <section aria-label="Ingestion jobs">
          <SectionTitle className="mb-2 flex items-center gap-1.5">
            <History className="h-3.5 w-3.5 text-[var(--nv-cyan)]" aria-hidden /> Ingestion jobs
          </SectionTitle>
          <ul className="space-y-1.5">
            {jobs.map((j) => (
              <li key={j.job_id} className="glass flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-xs">
                <FileText className="h-3.5 w-3.5 text-[var(--nv-text-muted)]" aria-hidden />
                <span className="font-medium text-[var(--nv-text)]">{j.filename}</span>
                <Badge
                  tone={
                    j.status === "completed"
                      ? "ok"
                      : j.status === "failed"
                        ? "danger"
                        : j.status === "processing"
                          ? "cyan"
                          : "muted"
                  }
                >
                  {j.status}
                  {j.stage && j.status === "processing" ? ` · ${j.stage}` : ""}
                </Badge>
                {j.chunks_added != null && <span className="text-[var(--nv-text-muted)]">{j.chunks_added} chunks</span>}
                {j.duration_ms != null && <span className="text-[var(--nv-text-muted)]">{j.duration_ms} ms</span>}
                {j.error && <span className="text-[var(--nv-danger)]">{j.error}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function DocumentCard({ doc, onReindex, busy }: { doc: DocumentInfo; onReindex: () => void; busy: boolean }) {
  const Icon = doc.file_type === "pdf" ? FileType2 : FileText;
  return (
    <Panel className="group p-4 transition hover:border-[var(--nv-border-strong)]">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            doc.indexed
              ? "bg-[rgba(66,232,245,0.1)] text-[var(--nv-cyan)]"
              : "bg-[rgba(102,136,190,0.1)] text-[var(--nv-text-muted)]",
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--nv-text)]" title={doc.name}>
            {doc.name}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge tone="muted">{doc.file_type.toUpperCase()}</Badge>
            {doc.indexed ? (
              <Badge tone="ok">indexed · {doc.chunk_count} chunks</Badge>
            ) : (
              <Badge tone="warn">not indexed</Badge>
            )}
            {doc.origin === "indexed_only" && <Badge tone="violet">in store, file absent</Badge>}
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-[var(--nv-text-muted)]">
            <div>
              <dt className="inline">Pages: </dt>
              <dd className="inline font-medium text-[var(--nv-text)]">{doc.page_count ?? "—"}</dd>
            </div>
            <div>
              <dt className="inline">Size: </dt>
              <dd className="inline font-medium text-[var(--nv-text)]">{formatBytes(doc.size_bytes)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="inline">Last ingested: </dt>
              <dd className="inline font-medium text-[var(--nv-text)]">{formatDate(doc.last_ingested_at)}</dd>
            </div>
          </dl>
        </div>
      </div>
      {doc.origin !== "indexed_only" && (
        <div className="mt-3 flex justify-end border-t border-[var(--nv-border)] pt-2.5">
          <Button variant="ghost" size="sm" loading={busy} icon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />} onClick={onReindex}>
            Re-index
          </Button>
        </div>
      )}
    </Panel>
  );
}
