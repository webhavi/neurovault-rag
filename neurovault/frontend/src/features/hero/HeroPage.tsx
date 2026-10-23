/**
 * HeroPage — the premium landing dashboard.
 * "Explore Knowledge. Discover Intelligence."
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, Database, FileStack, Layers, Sparkles, Zap } from "lucide-react";
import SceneHost from "@/components/neural/SceneHost";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Primitives";
import { useHealth } from "@/hooks/useHealth";
import { useStats } from "@/components/layout/TopBar";

export const EXAMPLE_QUESTIONS = [
  "Explain backpropagation in simple terms.",
  "What is the difference between RNNs and GRUs?",
  "How do embeddings help semantic search?",
  "Explain the vanishing gradient problem.",
  "Summarize the key concepts in my deep learning notes.",
];

interface HeroPageProps {
  onAsk: (question: string) => void;
}

export default function HeroPage({ onAsk }: HeroPageProps) {
  const [question, setQuestion] = useState("");
  const { status, health } = useHealth();
  const { stats } = useStats();

  const submit = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    onAsk(trimmed);
  };

  const docCount = stats?.documents?.length ?? null;
  const chunkCount = stats?.total_chunks ?? null;

  return (
    <div className="lab-grid relative min-h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* 3D scene as the atmospheric backdrop */}
      <div className="absolute inset-0 opacity-90">
        <SceneHost className="h-full w-full" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-6xl flex-col justify-center gap-8 px-4 py-10 sm:px-8 lg:py-14">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="max-w-2xl"
        >
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge tone="cyan">
              <Sparkles className="h-3 w-3" aria-hidden /> RAG-powered research assistant
            </Badge>
            <Badge tone={status === "online" ? "ok" : status === "offline" ? "danger" : "warn"}>
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  status === "online" ? "bg-[var(--nv-ok)]" : status === "offline" ? "bg-[var(--nv-danger)]" : "bg-[var(--nv-warn)]"
                }`}
                aria-hidden
              />
              Backend {status}
            </Badge>
          </div>
          <h1 className="text-4xl font-bold leading-[1.08] tracking-tight text-[var(--nv-text)] sm:text-5xl lg:text-[3.4rem]">
            Explore Knowledge.
            <br />
            <span className="text-gradient">Discover Intelligence.</span>
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[var(--nv-text-muted)]">
            Your personal deep learning research assistant, powered by retrieval-augmented
            generation. Ask a question — NeuroVault retrieves evidence from your indexed
            documents and answers only from that context.
          </p>
        </motion.div>

        {/* question composer */}
        <motion.form
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08, ease: "easeOut" }}
          className="glass glass-bright scanlines relative w-full max-w-2xl rounded-2xl p-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit(question);
          }}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label htmlFor="hero-question" className="sr-only">
              Your deep learning question
            </label>
            <input
              id="hero-question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask anything about your deep learning documents…"
              maxLength={4000}
              autoComplete="off"
              className="h-11 flex-1 rounded-xl border border-transparent bg-transparent px-3 text-[15px] text-[var(--nv-text)] placeholder:text-[var(--nv-text-muted)] focus:outline-none"
            />
            <Button type="submit" size="lg" icon={<Zap className="h-4 w-4" aria-hidden />}>
              Ask NeuroVault
            </Button>
          </div>
        </motion.form>

        {/* example chips */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.16 }}
          className="max-w-2xl"
        >
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--nv-text-muted)]">
            Try one of these
          </p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => submit(q)}
                className="group flex items-center gap-1.5 rounded-full border border-[var(--nv-border)] bg-[rgba(15,22,44,0.55)] px-3 py-1.5 text-xs text-[var(--nv-text-muted)] backdrop-blur transition hover:border-[var(--nv-cyan)] hover:text-[var(--nv-text)]"
              >
                {q}
                <ArrowUpRight className="h-3 w-3 opacity-0 transition group-hover:opacity-100" aria-hidden />
              </button>
            ))}
          </div>
        </motion.div>

        {/* live stats from the real backend */}
        <motion.dl
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.24 }}
          className="grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4"
        >
          <StatCard icon={<FileStack className="h-4 w-4" aria-hidden />} label="Documents" value={docCount == null ? "—" : String(docCount)} />
          <StatCard icon={<Database className="h-4 w-4" aria-hidden />} label="Indexed chunks" value={chunkCount == null ? "—" : String(chunkCount)} />
          <StatCard icon={<Layers className="h-4 w-4" aria-hidden />} label="Retrieval" value={stats ? `${String(stats.retrieval.strategy).toUpperCase()} · k=${stats.retrieval.k}` : "—"} />
          <StatCard icon={<Zap className="h-4 w-4" aria-hidden />} label="LLM" value={health?.checks.llm?.configured ? "Groq · ready" : "Not configured"} />
        </motion.dl>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="glass rounded-xl p-3">
      <dt className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--nv-text-muted)]">
        <span className="text-[var(--nv-cyan)]">{icon}</span>
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm font-semibold text-[var(--nv-text)]" title={value}>
        {value}
      </dd>
    </div>
  );
}
