/** Settings — appearance, 3D, motion, sidebar, data & privacy, backend health. */
import { Database, Eye, Gauge, Palette, Server, ShieldCheck, Trash2 } from "lucide-react";
import { Badge, Panel, SectionTitle } from "@/components/ui/Primitives";
import { Button } from "@/components/ui/Button";
import { useSettings } from "@/hooks/useSettings";
import { useHealth } from "@/hooks/useHealth";
import { API_BASE_LABEL } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function SettingsPage({ onClearConversations }: { onClearConversations: () => void }) {
  const { settings, update } = useSettings();
  const { health, status } = useHealth();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4 sm:p-6">
      <div>
        <h2 className="text-lg font-bold text-[var(--nv-text)]">Settings</h2>
        <p className="mt-0.5 text-xs text-[var(--nv-text-muted)]">
          Preferences are stored only in this browser. Provider secrets never touch the frontend.
        </p>
      </div>

      {/* appearance */}
      <Panel className="p-4">
        <SectionTitle className="mb-3 flex items-center gap-1.5">
          <Palette className="h-3.5 w-3.5 text-[var(--nv-cyan)]" aria-hidden /> Appearance
        </SectionTitle>
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-sm text-[var(--nv-text)]">Theme</p>
            <div className="flex gap-2" role="group" aria-label="Theme">
              {(["dark", "light"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => update({ theme: t })}
                  className={cn(
                    "h-9 rounded-xl border px-4 text-xs font-medium capitalize transition",
                    settings.theme === t
                      ? "border-[var(--nv-cyan)] bg-[rgba(66,232,245,0.08)] text-[var(--nv-text)]"
                      : "border-[var(--nv-border)] text-[var(--nv-text-muted)] hover:text-[var(--nv-text)]",
                  )}
                  aria-pressed={settings.theme === t}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <ToggleRow
            label="3D neural scene"
            hint="Disable to use the lightweight static fallback (recommended on low-power devices)."
            checked={settings.enable3D}
            onChange={(v) => update({ enable3D: v })}
          />
          <ToggleRow
            label="Show source previews"
            hint="Display chunk text previews in answers and the intelligence panel."
            checked={settings.showSourcePreviews}
            onChange={(v) => update({ showSourcePreviews: v })}
          />
          <ToggleRow
            label="Collapse sidebar by default"
            hint="Keep the navigation rail compact."
            checked={settings.sidebarCollapsed}
            onChange={(v) => update({ sidebarCollapsed: v })}
          />
          <div>
            <p className="mb-1.5 text-sm text-[var(--nv-text)]">Motion</p>
            <div className="flex gap-2" role="group" aria-label="Motion preference">
              {(["system", "full", "reduced"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => update({ motion: m })}
                  className={cn(
                    "h-9 rounded-xl border px-4 text-xs font-medium capitalize transition",
                    settings.motion === m
                      ? "border-[var(--nv-cyan)] bg-[rgba(66,232,245,0.08)] text-[var(--nv-text)]"
                      : "border-[var(--nv-border)] text-[var(--nv-text-muted)] hover:text-[var(--nv-text)]",
                  )}
                  aria-pressed={settings.motion === m}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      {/* backend */}
      <Panel className="p-4">
        <SectionTitle className="mb-3 flex items-center gap-1.5">
          <Server className="h-3.5 w-3.5 text-[var(--nv-cyan)]" aria-hidden /> Backend connection
        </SectionTitle>
        <dl className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[var(--nv-text-muted)]">API base</dt>
            <dd className="font-mono text-xs text-[var(--nv-text)]">{API_BASE_LABEL}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[var(--nv-text-muted)]">Status</dt>
            <dd>
              <Badge tone={status === "online" ? "ok" : status === "offline" ? "danger" : "warn"}>{status}</Badge>
            </dd>
          </div>
          {health && (
            <>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[var(--nv-text-muted)]">Vector store</dt>
                <dd className="text-xs text-[var(--nv-text)]">
                  {health.checks.vector_store?.state}
                  {health.checks.vector_store?.chunks != null ? ` · ${health.checks.vector_store.chunks} chunks` : ""}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[var(--nv-text-muted)]">Embedding model</dt>
                <dd className="break-all text-right text-xs text-[var(--nv-text)]">{health.checks.embeddings?.model}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[var(--nv-text-muted)]">LLM</dt>
                <dd className="break-all text-right text-xs text-[var(--nv-text)]">
                  {health.checks.llm?.model} · {health.checks.llm?.configured ? "configured" : "GROQ_API_KEY missing"}
                </dd>
              </div>
            </>
          )}
        </dl>
        {health?.checks.llm?.detail && (
          <p className="mt-3 rounded-lg border border-[rgba(251,191,36,0.3)] bg-[rgba(251,191,36,0.06)] p-2.5 text-xs text-[var(--nv-warn)]">
            {health.checks.llm.detail}
          </p>
        )}
      </Panel>

      {/* data & privacy */}
      <Panel className="p-4">
        <SectionTitle className="mb-3 flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-[var(--nv-cyan)]" aria-hidden /> Data & privacy
        </SectionTitle>
        <ul className="mb-3 space-y-1.5 text-xs leading-relaxed text-[var(--nv-text-muted)]">
          <li className="flex gap-2">
            <Database className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--nv-violet)]" aria-hidden />
            Conversations are saved in this browser's localStorage only — they are not synced to the
            server or across devices.
          </li>
          <li className="flex gap-2">
            <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--nv-violet)]" aria-hidden />
            The frontend never sees your GROQ_API_KEY; all provider calls happen server-side.
          </li>
          <li className="flex gap-2">
            <Gauge className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--nv-violet)]" aria-hidden />
            Retrieval settings (k, fetch_k, λ) are configured on the backend and cannot be changed from
            here.
          </li>
        </ul>
        <Button
          variant="danger"
          size="sm"
          icon={<Trash2 className="h-3.5 w-3.5" aria-hidden />}
          onClick={() => {
            if (window.confirm("Delete all locally stored conversations from this browser?")) {
              onClearConversations();
            }
          }}
        >
          Clear local conversations
        </Button>
      </Panel>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm text-[var(--nv-text)]">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-[var(--nv-text-muted)]">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition",
          checked
            ? "border-[var(--nv-cyan)] bg-[rgba(66,232,245,0.25)]"
            : "border-[var(--nv-border)] bg-[rgba(102,136,190,0.12)]",
        )}
      >
        <span
          className={cn(
            "ml-0.5 h-[18px] w-[18px] rounded-full bg-[var(--nv-text)] transition",
            checked ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}
