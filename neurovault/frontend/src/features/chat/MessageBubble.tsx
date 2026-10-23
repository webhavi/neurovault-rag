import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Check, ChevronDown, ChevronRight, Copy, Brain, Database, KeyRound, RefreshCw, TriangleAlert, User } from "lucide-react";
import MarkdownMessage from "./MarkdownMessage";
import { Badge } from "@/components/ui/Primitives";
import { cn, formatMs } from "@/lib/utils";
import type { ChatMessage } from "@/hooks/useChat";

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          /* clipboard unavailable */
        }
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      }}
      className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-[var(--nv-text-muted)] transition hover:bg-[rgba(102,136,190,0.12)] hover:text-[var(--nv-text)]"
      aria-label={label}
    >
      {copied ? <Check className="h-3 w-3 text-[var(--nv-ok)]" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function SourceList({ sources }: { sources: NonNullable<ChatMessage["sources"]> }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  if (sources.length === 0) return null;
  return (
    <div className="mt-3 border-t border-[var(--nv-border)] pt-2.5">
      <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--nv-text-muted)]">
        Retrieved sources · {sources.length}
      </p>
      <ul className="space-y-1.5">
        {sources.map((s, i) => (
          <li key={i} className="rounded-lg border border-[var(--nv-border)] bg-[rgba(102,136,190,0.06)]">
            <button
              type="button"
              onClick={() => setOpenIdx(openIdx === i ? null : i)}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
              aria-expanded={openIdx === i}
            >
              {openIdx === i ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--nv-cyan)]" aria-hidden />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--nv-text-muted)]" aria-hidden />
              )}
              <span className="truncate text-xs font-medium text-[var(--nv-text)]">{s.document}</span>
              {s.page != null && <Badge tone="cyan">p. {s.page}</Badge>}
              <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wider text-[var(--nv-text-muted)]">
                chunk {i + 1}
              </span>
            </button>
            {openIdx === i && (
              <p className="border-t border-[var(--nv-border)] px-3 py-2 text-xs leading-relaxed text-[var(--nv-text-muted)]">
                “{s.content_preview}”
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export const FOLLOW_UPS = [
  "How does MMR balance relevance and diversity?",
  "What causes vanishing gradients in deep networks?",
  "Compare LSTM and GRU architectures.",
  "Why does chunk overlap matter for retrieval?",
];

interface MessageBubbleProps {
  message: ChatMessage;
  showFollowUps: boolean;
  onFollowUp: (q: string) => void;
  onRegenerate: () => void;
  canRegenerate: boolean;
  isSending: boolean;
}

export default function MessageBubble({
  message,
  showFollowUps,
  onFollowUp,
  onRegenerate,
  canRegenerate,
  isSending,
}: MessageBubbleProps) {
  if (message.role === "user") {
    return (
      <motion.article
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="flex justify-end"
        aria-label="Your question"
      >
        <div className="max-w-[85%] rounded-2xl rounded-br-md border border-[rgba(152,117,255,0.3)] bg-[rgba(152,117,255,0.12)] px-4 py-2.5 text-sm leading-relaxed text-[var(--nv-text)]">
          {message.content}
        </div>
      </motion.article>
    );
  }

  /* ---------------- assistant ---------------- */
  if (message.status === "loading") {
    return (
      <motion.article
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="flex items-start gap-2.5"
        aria-label="Assistant is thinking"
        aria-busy="true"
      >
        <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[rgba(66,232,245,0.12)]">
          <Brain className="h-3.5 w-3.5 text-[var(--nv-cyan)] animate-pulse-soft" aria-hidden />
        </span>
        <div className="rounded-2xl rounded-tl-md border border-[var(--nv-border)] bg-[rgba(15,22,44,0.5)] px-4 py-3">
          <span className="flex items-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-[var(--nv-cyan)]"
                style={{ animationDelay: `${i * 0.18}s` }}
              />
            ))}
          </span>
          <p className="mt-1.5 text-xs text-[var(--nv-text-muted)]">
            Retrieving context from your knowledge base and composing a grounded answer…
          </p>
        </div>
      </motion.article>
    );
  }

  const navigate = useNavigate();

  if (message.status === "error") {
    const isApiKeyMissing =
      message.errorText?.includes("GROQ_API_KEY") || message.errorText?.includes("provider_not_configured");
    const isEmptyStore =
      message.errorText?.includes("empty_vector_store") ||
      message.errorText?.includes("No documents are indexed") ||
      message.errorText?.includes("Open the Knowledge Library");

    return (
      <motion.article
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start gap-2.5"
        role="alert"
      >
        <span
          className={cn(
            "mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg",
            isApiKeyMissing
              ? "bg-[rgba(245,158,11,0.12)]"
              : isEmptyStore
                ? "bg-[rgba(66,232,245,0.12)]"
                : "bg-[rgba(248,113,113,0.12)]",
          )}
        >
          {isApiKeyMissing ? (
            <KeyRound className="h-3.5 w-3.5 text-[var(--nv-warn)]" aria-hidden />
          ) : isEmptyStore ? (
            <Database className="h-3.5 w-3.5 text-[var(--nv-cyan)]" aria-hidden />
          ) : (
            <TriangleAlert className="h-3.5 w-3.5 text-[var(--nv-danger)]" aria-hidden />
          )}
        </span>
        <div
          className={cn(
            "max-w-[85%] rounded-2xl rounded-tl-md border px-4 py-3",
            isApiKeyMissing
              ? "border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.07)]"
              : isEmptyStore
                ? "border-[rgba(66,232,245,0.35)] bg-[rgba(66,232,245,0.07)]"
                : "border-[rgba(248,113,113,0.35)] bg-[rgba(248,113,113,0.07)]",
          )}
        >
          <p className="text-sm font-medium text-[var(--nv-text)]">
            {isApiKeyMissing
              ? "Groq API Key Required"
              : isEmptyStore
                ? "Knowledge Base Is Empty"
                : "The request failed."}
          </p>
          <p className="mt-1 break-words text-xs text-[var(--nv-text-muted)]">{message.errorText}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {canRegenerate && (
              <button
                type="button"
                onClick={onRegenerate}
                disabled={isSending}
                className="flex items-center gap-1.5 text-xs font-medium text-[var(--nv-cyan)] hover:underline disabled:opacity-50"
              >
                <RefreshCw className="h-3 w-3" aria-hidden /> Retry
              </button>
            )}
            {isEmptyStore && (
              <button
                type="button"
                onClick={() => navigate("/view/knowledge")}
                className="flex items-center gap-1.5 text-xs font-medium text-[var(--nv-cyan)] hover:underline"
              >
                <Database className="h-3 w-3" aria-hidden /> Open Knowledge Library
              </button>
            )}
            {isApiKeyMissing && (
              <span className="text-[11px] text-[var(--nv-text-muted)]">
                Set <code className="rounded bg-[rgba(102,136,190,0.18)] px-1 py-0.5 text-[var(--nv-cyan)]">GROQ_API_KEY=gsk_...</code> in <code className="rounded bg-[rgba(102,136,190,0.18)] px-1 py-0.5">backend/.env</code>
              </span>
            )}
          </div>
        </div>
      </motion.article>
    );
  }

  const grounded = message.metadata?.grounded !== false;
  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="flex items-start gap-2.5"
      aria-label="Assistant answer"
    >
      <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[rgba(66,232,245,0.12)]">
        <Brain className="h-3.5 w-3.5 text-[var(--nv-cyan)]" aria-hidden />
      </span>
      <div className="min-w-0 max-w-[92%] rounded-2xl rounded-tl-md border border-[var(--nv-border)] bg-[rgba(15,22,44,0.5)] px-4 py-3">
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          {!grounded && <Badge tone="warn">No supporting sources in the index</Badge>}
          {message.metadata?.model && <Badge tone="violet">{message.metadata.model}</Badge>}
          {message.retrieval && (
            <Badge tone="muted">
              {message.retrieval.strategy.toUpperCase()} · {message.retrieval.chunks_retrieved} chunks
              {message.retrieval.duration_ms != null ? ` · ${formatMs(message.retrieval.duration_ms)}` : ""}
            </Badge>
          )}
        </div>
        <MarkdownMessage content={message.content} />
        <div className="mt-2 flex items-center gap-1">
          <CopyBtn text={message.content} label="Copy answer" />
          {canRegenerate && (
            <button
              type="button"
              onClick={onRegenerate}
              disabled={isSending}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-[var(--nv-text-muted)] transition hover:bg-[rgba(102,136,190,0.12)] hover:text-[var(--nv-text)] disabled:opacity-50"
              aria-label="Regenerate answer"
            >
              <RefreshCw className={cn("h-3 w-3", isSending && "animate-spin")} />
              Regenerate
            </button>
          )}
        </div>
        {message.sources && <SourceList sources={message.sources} />}
        {showFollowUps && (
          <div className="mt-3 border-t border-[var(--nv-border)] pt-2.5">
            <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--nv-text-muted)]">
              Suggested follow-ups
            </p>
            <div className="flex flex-wrap gap-1.5">
              {FOLLOW_UPS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => onFollowUp(q)}
                  className="rounded-full border border-[var(--nv-border)] px-2.5 py-1 text-[11px] text-[var(--nv-text-muted)] transition hover:border-[var(--nv-cyan)] hover:text-[var(--nv-text)]"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.article>
  );
}

export function UserIcon() {
  return <User className="h-3.5 w-3.5" aria-hidden />;
}
