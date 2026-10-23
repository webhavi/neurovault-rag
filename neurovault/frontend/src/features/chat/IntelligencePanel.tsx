/**
 * Right "intelligence" panel: real retrieval metadata for the latest answer,
 * pipeline info and live configuration. Values that the backend does not
 * provide are shown as "Unavailable" — never fabricated.
 */
import { Activity as ActivityIcon, BookOpen, Database, Server, SlidersHorizontal } from "lucide-react";
import { Badge, SectionTitle } from "@/components/ui/Primitives";
import { useConfig } from "@/components/layout/TopBar";
import { useHealth } from "@/hooks/useHealth";
import type { ChatMessage } from "@/hooks/useChat";
import { formatMs } from "@/lib/utils";

export default function IntelligencePanel({ lastAssistant }: { lastAssistant: ChatMessage | null }) {
  const { config } = useConfig();
  const { health } = useHealth();

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      {/* -------- sources -------- */}
      <section aria-label="Retrieved sources">
        <SectionTitle className="mb-2 flex items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5 text-[var(--nv-cyan)]" aria-hidden /> Latest sources
        </SectionTitle>
        {lastAssistant?.sources && lastAssistant.sources.length > 0 ? (
          <ul className="space-y-1.5">
            {lastAssistant.sources.map((s, i) => (
              <li key={i} className="rounded-xl border border-[var(--nv-border)] bg-[rgba(102,136,190,0.06)] p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium text-[var(--nv-text)]">{s.document}</span>
                  {s.page != null ? <Badge tone="cyan">p. {s.page}</Badge> : <Badge tone="muted">page unavailable</Badge>}
                </div>
                <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-[var(--nv-text-muted)]">
                  {s.content_preview}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-[var(--nv-border)] p-3 text-xs text-[var(--nv-text-muted)]">
            {lastAssistant
              ? "No sources were attached to the latest answer."
              : "Ask a question to see the retrieved document chunks here."}
          </p>
        )}
      </section>

      {/* -------- pipeline -------- */}
      <section aria-label="Retrieval pipeline details">
        <SectionTitle className="mb-2 flex items-center gap-1.5">
          <ActivityIcon className="h-3.5 w-3.5 text-[var(--nv-cyan)]" aria-hidden /> Pipeline · last request
        </SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          <Metric label="Strategy" value={lastAssistant?.retrieval?.strategy ?? "—"} />
          <Metric label="Chunks" value={lastAssistant?.retrieval ? String(lastAssistant.retrieval.chunks_retrieved) : "—"} />
          <Metric label="Retrieval time" value={formatMs(lastAssistant?.retrieval?.duration_ms ?? null)} />
          <Metric label="Total time" value={formatMs(lastAssistant?.metadata?.duration_ms ?? null)} />
          <Metric label="Generation" value={formatMs(lastAssistant?.metadata?.generation_ms ?? null)} />
          <Metric
            label="Grounded"
            value={lastAssistant?.metadata ? (lastAssistant.metadata.grounded ? "yes" : "no") : "—"}
          />
        </div>
      </section>

      {/* -------- config -------- */}
      <section aria-label="Configuration and providers">
        <SectionTitle className="mb-2 flex items-center gap-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5 text-[var(--nv-cyan)]" aria-hidden /> Retrieval config
        </SectionTitle>
        {config ? (
          <dl className="space-y-1.5 rounded-xl border border-[var(--nv-border)] bg-[rgba(102,136,190,0.06)] p-3 text-xs">
            <Row k="Strategy" v={`${config.strategy.toUpperCase()} (k=${config.k}, fetch_k=${config.fetch_k}, λ=${config.lambda_mult})`} />
            <Row k="Chunking" v={`${config.chunk_size} / ${config.chunk_overlap} overlap`} />
            <Row k="Embeddings" v={config.embedding_model} />
            <Row k="LLM" v={`${config.llm_provider} · ${config.llm_model}`} />
          </dl>
        ) : (
          <p className="rounded-xl border border-dashed border-[var(--nv-border)] p-3 text-xs text-[var(--nv-text-muted)]">
            Config unavailable — is the backend running?
          </p>
        )}
      </section>

      {/* -------- backend -------- */}
      <section aria-label="Backend status">
        <SectionTitle className="mb-2 flex items-center gap-1.5">
          <Server className="h-3.5 w-3.5 text-[var(--nv-cyan)]" aria-hidden /> Backend
        </SectionTitle>
        <div className="space-y-1.5 rounded-xl border border-[var(--nv-border)] bg-[rgba(102,136,190,0.06)] p-3 text-xs">
          {health ? (
            <>
              <div className="flex items-center gap-2">
                <Database className="h-3.5 w-3.5 text-[var(--nv-text-muted)]" aria-hidden />
                <span className="text-[var(--nv-text-muted)]">Vector store:</span>
                <Badge tone={health.checks.vector_store?.ok ? "ok" : "warn"}>
                  {health.checks.vector_store?.state ?? "unknown"}
                  {health.checks.vector_store?.chunks != null ? ` · ${health.checks.vector_store.chunks} chunks` : ""}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 text-center text-[var(--nv-text-muted)]">λ</span>
                <span className="text-[var(--nv-text-muted)]">LLM key:</span>
                <Badge tone={health.checks.llm?.configured ? "ok" : "danger"}>
                  {health.checks.llm?.configured ? "configured" : "not configured"}
                </Badge>
              </div>
              <p className="text-[10.5px] text-[var(--nv-text-muted)]">API v{health.version}</p>
            </>
          ) : (
            <p className="text-[var(--nv-text-muted)]">Backend unreachable.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--nv-border)] bg-[rgba(102,136,190,0.06)] px-2.5 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--nv-text-muted)]">{label}</p>
      <p className="mt-0.5 truncate text-[13px] font-medium text-[var(--nv-text)]" title={value}>
        {value}
      </p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-[var(--nv-text-muted)]">{k}</dt>
      <dd className="text-right font-medium text-[var(--nv-text)] break-words">{v}</dd>
    </div>
  );
}
