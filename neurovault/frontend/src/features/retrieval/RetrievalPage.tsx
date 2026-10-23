/**
 * Retrieval Explorer — the RAG pipeline monitor.
 *
 * "Runtime data" stages display REAL measured values from a live trace.
 * Stages marked "Explanation" describe steps that only execute inside a chat
 * request (LLM generation) and are never faked here.
 */
import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowDown,
  Binary,
  Braces,
  ChevronDown,
  Cpu,
  Database,
  FileSearch,
  Filter,
  Gauge,
  MessageSquareText,
  ScanSearch,
  Sparkles,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToasts } from "@/hooks/useToasts";
import { Badge, Panel, SectionTitle } from "@/components/ui/Primitives";
import { Button } from "@/components/ui/Button";
import { cn, formatMs, truncate } from "@/lib/utils";
import type { TraceResponse } from "@/types";

const STAGES = [
  { n: 1, icon: MessageSquareText, title: "User question", desc: "The question is validated and normalized (trimmed, length-checked) before entering the pipeline." },
  { n: 2, icon: Filter, title: "Query processing", desc: "The question is passed to the embedding model as the search query. No keyword rewriting is performed." },
  { n: 3, icon: Binary, title: "Vector embeddings", desc: "The question is embedded into the same vector space as the indexed chunks using the HuggingFace MiniLM model.", runtime: "embedding_ms" as const },
  { n: 4, icon: Database, title: "ChromaDB similarity search", desc: "A vector search over the persistent Chroma collection fetches the top fetch_k most similar candidate chunks.", runtime: "candidate_search_ms" as const },
  { n: 5, icon: ScanSearch, title: "MMR selection", desc: "Maximum Marginal Relevance re-ranks candidates, balancing relevance to the query against diversity (lambda_mult).", runtime: "mmr_selection_ms" as const },
  { n: 6, icon: FileSearch, title: "Retrieved chunks", desc: "The selected chunks with their documents, pages and cosine similarities." },
  { n: 7, icon: Braces, title: "Context construction", desc: "Selected chunks are joined into the context block of the grounded prompt." },
  { n: 8, icon: Cpu, title: "Groq answer generation", desc: "The LLM answers strictly from the context. This step only runs during chat requests — ask in Chat to see real generation timings." },
  { n: 9, icon: Sparkles, title: "Final response", desc: "Answer + source metadata + retrieval stats are returned to the UI." },
];

export default function RetrievalPage() {
  const [question, setQuestion] = useState("Explain the vanishing gradient problem.");
  const [trace, setTrace] = useState<TraceResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [openCandidate, setOpenCandidate] = useState<number | null>(null);
  const { push } = useToasts();

  const run = useCallback(async () => {
    const q = question.trim();
    if (!q || running) return;
    setRunning(true);
    try {
      const res = await api.trace({ question: q });
      setTrace(res);
      if (res.status === "empty") push("info", "Nothing to retrieve", res.detail ?? undefined);
      if (res.status === "unavailable") push("error", "Trace unavailable", res.detail ?? undefined);
    } catch (e) {
      push("error", "Trace failed", e instanceof Error ? e.message : "Unknown error.");
    } finally {
      setRunning(false);
    }
  }, [question, running, push]);

  const timings = trace?.timings;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4 sm:p-6">
      <div>
        <h2 className="text-lg font-bold text-[var(--nv-text)]">Retrieval Explorer</h2>
        <p className="mt-0.5 text-xs text-[var(--nv-text-muted)]">
          Watch a question travel through the real RAG pipeline — embeddings, ChromaDB search and MMR
          selection with live measured timings.
        </p>
      </div>

      {/* trace runner */}
      <Panel bright className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
        <label htmlFor="trace-question" className="sr-only">
          Question to trace
        </label>
        <input
          id="trace-question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void run()}
          maxLength={4000}
          className="h-10 flex-1 rounded-xl border border-transparent bg-transparent px-3 text-sm text-[var(--nv-text)] placeholder:text-[var(--nv-text-muted)] focus:outline-none"
          placeholder="Question to trace through the pipeline…"
        />
        <Button onClick={() => void run()} loading={running} icon={<Gauge className="h-4 w-4" aria-hidden />}>
          Run trace
        </Button>
      </Panel>

      {/* pipeline monitor strip */}
      {timings && trace?.status === "ok" && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <MiniStat label="Embedding" value={formatMs(timings.embedding_ms)} />
          <MiniStat label="Search" value={formatMs(timings.candidate_search_ms)} />
          <MiniStat label="MMR" value={formatMs(timings.mmr_selection_ms)} />
          <MiniStat label="Projection" value={formatMs(timings.projection_ms)} />
          <MiniStat label="Total" value={formatMs(timings.total_ms)} accent />
        </div>
      )}

      {/* stages */}
      <ol className="relative flex flex-col">
        {STAGES.map((stage, idx) => {
          const Icon = stage.icon;
          const hasRuntime = stage.runtime != null && trace?.status === "ok" && timings?.[stage.runtime] != null;
          const isChunkStage = stage.n === 6;
          const isContextStage = stage.n === 7;
          return (
            <li key={stage.n} className="relative flex gap-3 pb-1">
              {/* connector */}
              {idx < STAGES.length - 1 && (
                <span className="absolute left-[19px] top-10 h-[calc(100%-1.4rem)] w-px bg-gradient-to-b from-[rgba(66,232,245,0.35)] to-[rgba(152,117,255,0.2)]" aria-hidden />
              )}
              <span className="relative z-10 mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--nv-border-strong)] bg-[rgba(11,16,32,0.9)]">
                <Icon className="h-4 w-4 text-[var(--nv-cyan)]" aria-hidden />
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[rgba(152,117,255,0.25)] text-[9px] font-bold text-[var(--nv-text)]">
                  {stage.n}
                </span>
              </span>
              <Panel className="mb-2.5 min-w-0 flex-1 p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-[var(--nv-text)]">{stage.title}</h3>
                  {hasRuntime ? (
                    <Badge tone="ok">runtime · {formatMs(timings![stage.runtime!])}</Badge>
                  ) : (
                    <Badge tone="muted">explanation</Badge>
                  )}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-[var(--nv-text-muted)]">{stage.desc}</p>

                {/* real per-stage data */}
                {trace?.status === "ok" && stage.n === 3 && (
                  <p className="mt-2 font-mono text-[11px] text-[var(--nv-cyan)]">
                    query vector: {trace.query_embedding_dim} dims → 3D PCA point [{trace.query_point?.map((v) => v.toFixed(2)).join(", ")}]
                  </p>
                )}
                {trace?.status === "ok" && stage.n === 4 && (
                  <p className="mt-2 text-[11px] text-[var(--nv-text-muted)]">
                    fetched {trace.candidates.length} candidate(s) from collection (fetch_k={trace.mmr_params.fetch_k})
                  </p>
                )}
                {trace?.status === "ok" && stage.n === 5 && (
                  <p className="mt-2 text-[11px] text-[var(--nv-text-muted)]">
                    MMR selected {trace.candidates.filter((c) => c.selected_by_mmr).length} chunk(s) (k={trace.mmr_params.k}, λ={trace.mmr_params.lambda_mult})
                  </p>
                )}
                {isChunkStage && trace?.status === "ok" && (
                  <ul className="mt-2 space-y-1.5">
                    {trace.candidates.map((c, i) => (
                      <li key={i} className={cn("rounded-lg border px-2.5 py-1.5", c.selected_by_mmr ? "border-[rgba(66,232,245,0.4)] bg-[rgba(66,232,245,0.05)]" : "border-[var(--nv-border)]")}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 text-left"
                          onClick={() => setOpenCandidate(openCandidate === i ? null : i)}
                          aria-expanded={openCandidate === i}
                        >
                          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-[var(--nv-text-muted)] transition", openCandidate === i && "rotate-180")} aria-hidden />
                          <span className="truncate text-xs font-medium text-[var(--nv-text)]">{c.document}</span>
                          {c.page != null && <Badge tone="cyan">p. {c.page}</Badge>}
                          {c.selected_by_mmr && <Badge tone="violet">MMR pick</Badge>}
                          <span className="ml-auto shrink-0 font-mono text-[11px] text-[var(--nv-cyan)]">
                            cos {c.similarity?.toFixed(3)}
                          </span>
                        </button>
                        {openCandidate === i && (
                          <p className="mt-1.5 border-t border-[var(--nv-border)] pt-1.5 text-[11px] leading-relaxed text-[var(--nv-text-muted)]">
                            {truncate(c.preview, 280)}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {isContextStage && trace?.status === "ok" && (
                  <div className="mt-2">
                    <p className="text-[11px] text-[var(--nv-text-muted)]">
                      context block: {trace.context_chars} chars from MMR-selected chunks
                    </p>
                    {trace.context_preview && (
                      <pre className="mt-1.5 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg border border-[var(--nv-border)] bg-[rgba(7,10,18,0.6)] p-2 font-mono text-[10.5px] leading-relaxed text-[var(--nv-text-muted)]">
                        {truncate(trace.context_preview, 600)}
                      </pre>
                    )}
                  </div>
                )}
              </Panel>
            </li>
          );
        })}
      </ol>

      {/* trace notes */}
      {trace?.status === "ok" && (
        <Panel className="p-3.5">
          <SectionTitle className="mb-1.5">How to read these numbers</SectionTitle>
          <ul className="space-y-1">
            {trace.notes.map((note, i) => (
              <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-[var(--nv-text-muted)]">
                <ArrowDown className="mt-0.5 h-3 w-3 shrink-0 rotate-180 text-[var(--nv-cyan)]" aria-hidden />
                {note}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {trace?.status === "empty" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Panel className="p-4">
            <p className="text-sm text-[var(--nv-warn)]">{trace.detail}</p>
            <p className="mt-1 text-xs text-[var(--nv-text-muted)]">
              Upload a document in the Knowledge Library, then run a trace again.
            </p>
          </Panel>
        </motion.div>
      )}
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={cn("glass rounded-xl px-3 py-2", accent && "border-[rgba(152,117,255,0.4)]")}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--nv-text-muted)]">{label}</p>
      <p className={cn("mt-0.5 font-mono text-[13px] font-medium", accent ? "text-[var(--nv-violet)]" : "text-[var(--nv-cyan)]")}>
        {value}
      </p>
    </div>
  );
}
