import { useState } from "react";
import { Database, Eye, EyeOff, Gauge, KeyRound, Palette, Server, ShieldCheck, Trash2 } from "lucide-react";
import { Badge, Panel, SectionTitle } from "@/components/ui/Primitives";
import { Button } from "@/components/ui/Button";
import { useSettings, type ByokProvider } from "@/hooks/useSettings";
import { useHealth } from "@/hooks/useHealth";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function SettingsPage({ onClearConversations }: { onClearConversations: () => void }) {
  const { settings, update } = useSettings();
  const { health, status, refresh } = useHealth();
  const [provider, setProvider] = useState<ByokProvider>(settings.byokProvider || "groq");
  const [keyInput, setKeyInput] = useState(settings.byokKey);
  const [modelInput, setModelInput] = useState(settings.byokModel || "");
  const [apiUrlInput, setApiUrlInput] = useState(settings.apiUrl || "");
  const [showAdvancedConnection, setShowAdvancedConnection] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [apiSaved, setApiSaved] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleKeyChange = (val: string) => {
    setKeyInput(val);
    const trimmed = val.trim();
    if (trimmed.startsWith("AIza")) {
      setProvider("gemini");
      if (!modelInput || !modelInput.startsWith("gemini")) {
        setModelInput("gemini-1.5-flash");
      }
    } else if (trimmed.startsWith("sk-") && !trimmed.startsWith("gsk_")) {
      setProvider("openai");
      if (!modelInput || !modelInput.startsWith("gpt-")) {
        setModelInput("gpt-4o-mini");
      }
    } else if (trimmed.startsWith("gsk_")) {
      setProvider("groq");
      if (!modelInput || modelInput.startsWith("gpt-") || modelInput.startsWith("gemini")) {
        setModelInput("openai/gpt-oss-120b");
      }
    }
  };

  const handleProviderSelect = (p: ByokProvider) => {
    setProvider(p);
    if (p === "gemini") {
      if (!modelInput || !modelInput.startsWith("gemini")) {
        setModelInput("gemini-1.5-flash");
      }
    } else if (p === "openai") {
      if (!modelInput || !modelInput.startsWith("gpt-")) {
        setModelInput("gpt-4o-mini");
      }
    } else {
      if (!modelInput || modelInput.startsWith("gpt-") || modelInput.startsWith("gemini")) {
        setModelInput("openai/gpt-oss-120b");
      }
    }
  };

  const handleSave = () => {
    update({
      byokKey: keyInput.trim(),
      byokProvider: provider,
      byokModel: modelInput.trim(),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = () => {
    setKeyInput("");
    setModelInput("");
    update({ byokKey: "", byokModel: "" });
  };

  const handleSaveApiUrl = () => {
    const trimmed = apiUrlInput.trim();
    update({ apiUrl: trimmed });
    setApiSaved(true);
    setTimeout(() => setApiSaved(false), 2000);
    setTimeout(() => void refresh(), 100);
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionResult(null);
    try {
      const trimmed = apiUrlInput.trim();
      update({ apiUrl: trimmed });
      const res = await api.health();
      setConnectionResult({
        ok: true,
        message: `Connected successfully! Status: ${res.status}, chunks: ${res.checks.vector_store?.chunks ?? 0}, LLM: ${res.checks.llm?.model ?? "configured"}.`,
      });
      void refresh();
    } catch (err) {
      setConnectionResult({
        ok: false,
        message: err instanceof Error ? err.message : "Failed to connect to backend server.",
      });
    } finally {
      setTestingConnection(false);
    }
  };

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

      {/* byok api key */}
      <Panel className="p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <SectionTitle className="flex items-center gap-1.5">
            <KeyRound className="h-3.5 w-3.5 text-[var(--nv-cyan)]" aria-hidden /> API Key & Model Access (BYOK)
          </SectionTitle>
          <Badge
            tone={
              settings.byokKey.trim()
                ? "ok"
                : health?.checks.llm?.configured
                  ? "cyan"
                  : "warn"
            }
          >
            {settings.byokKey.trim()
              ? `Custom ${settings.byokProvider === "openai" ? "OpenAI" : "Groq"} key active`
              : health?.checks.llm?.configured
                ? "Server key active"
                : "No key configured"}
          </Badge>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-[var(--nv-text-muted)]">
          Bring Your Own Key (BYOK) allows you to use your personal <strong>Groq</strong> (starts with <code className="font-mono text-[var(--nv-text)]">gsk_</code>) or <strong>OpenAI</strong> (starts with <code className="font-mono text-[var(--nv-text)]">sk-</code>) API key. When configured, your chat requests run directly under your personal account. Keys are stored only in this browser and transmitted securely.
        </p>

        {/* Provider selector */}
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-medium text-[var(--nv-text)]">LLM Provider</p>
          <div className="flex gap-2" role="group" aria-label="LLM Provider">
            <button
              type="button"
              onClick={() => handleProviderSelect("groq")}
              className={cn(
                "flex items-center gap-1.5 rounded-xl border px-3.5 py-1.5 text-xs font-medium transition",
                provider === "groq"
                  ? "border-[var(--nv-cyan)] bg-[rgba(66,232,245,0.08)] text-[var(--nv-text)]"
                  : "border-[var(--nv-border)] text-[var(--nv-text-muted)] hover:text-[var(--nv-text)]",
              )}
            >
              <span>⚡ Groq (Fast)</span>
            </button>
            <button
              type="button"
              onClick={() => handleProviderSelect("openai")}
              className={cn(
                "flex items-center gap-1.5 rounded-xl border px-3.5 py-1.5 text-xs font-medium transition",
                provider === "openai"
                  ? "border-[var(--nv-cyan)] bg-[rgba(66,232,245,0.08)] text-[var(--nv-text)]"
                  : "border-[var(--nv-border)] text-[var(--nv-text-muted)] hover:text-[var(--nv-text)]",
              )}
            >
              <span>🤖 OpenAI</span>
            </button>
          </div>
        </div>

        {/* Model selector */}
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-medium text-[var(--nv-text)]">Model</p>
          <select
            value={modelInput || (provider === "openai" ? "gpt-4o-mini" : "openai/gpt-oss-120b")}
            onChange={(e) => setModelInput(e.target.value)}
            className="w-full rounded-xl border border-[var(--nv-border)] bg-[rgba(10,16,28,0.4)] px-3 py-2 text-xs text-[var(--nv-text)] focus:border-[var(--nv-cyan)] focus:outline-none"
          >
            {provider === "groq" ? (
              <>
                <option value="openai/gpt-oss-120b">openai/gpt-oss-120b (Server Default)</option>
                <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</option>
                <option value="mixtral-8x7b-32768">mixtral-8x7b-32768</option>
                <option value="llama-3.1-8b-instant">llama-3.1-8b-instant</option>
              </>
            ) : (
              <>
                <option value="gpt-4o-mini">gpt-4o-mini (Recommended - Fast & Smart)</option>
                <option value="gpt-4o">gpt-4o (Most Capable)</option>
                <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
              </>
            )}
          </select>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <input
              type={showKey ? "text" : "password"}
              value={keyInput}
              onChange={(e) => handleKeyChange(e.target.value)}
              placeholder={provider === "openai" ? "sk-..." : "gsk_..."}
              className="w-full rounded-xl border border-[var(--nv-border)] bg-[rgba(10,16,28,0.4)] px-3.5 py-2 pr-10 font-mono text-xs text-[var(--nv-text)] placeholder:text-[var(--nv-text-muted)] focus:border-[var(--nv-cyan)] focus:outline-none"
              aria-label={`${provider.toUpperCase()} API Key`}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[var(--nv-text-muted)] transition hover:text-[var(--nv-text)]"
              title={showKey ? "Hide key" : "Show key"}
              aria-label={showKey ? "Hide key" : "Show key"}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
            >
              {saved ? "Saved!" : "Save Key"}
            </Button>
            {settings.byokKey && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        <div className="mt-2.5 flex items-center justify-between text-[11px] text-[var(--nv-text-muted)]">
          <span>Need an API key?</span>
          {provider === "openai" ? (
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[var(--nv-cyan)] hover:underline"
            >
              Get an OpenAI API Key &rarr;
            </a>
          ) : (
            <a
              href="https://console.groq.com/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[var(--nv-cyan)] hover:underline"
            >
              Get a Groq API Key &rarr;
            </a>
          )}
        </div>
      </Panel>

      {/* backend */}
      <Panel className="p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <SectionTitle className="flex items-center gap-1.5">
            <Server className="h-3.5 w-3.5 text-[var(--nv-cyan)]" aria-hidden /> AI Service Connection
          </SectionTitle>
          <Badge tone={status === "online" ? "ok" : "warn"}>
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                status === "online" ? "bg-[var(--nv-ok)]" : "bg-[var(--nv-warn)] animate-pulse"
              }`}
              aria-hidden
            />
            {status === "online" ? "Connected" : status === "checking" ? "Connecting securely…" : "Waking up service…"}
          </Badge>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-[var(--nv-text-muted)]">
          NeuroVault connects securely and automatically to the AI backend. RAG intelligence, retrieval pipelines, and embeddings are available out of the box.
        </p>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleTestConnection}
            disabled={testingConnection}
          >
            {testingConnection ? "Testing connection…" : "Test Connection"}
          </Button>
          <button
            type="button"
            onClick={() => setShowAdvancedConnection((prev) => !prev)}
            className="text-[11px] text-[var(--nv-text-muted)] hover:text-[var(--nv-text)] transition underline underline-offset-4"
          >
            {showAdvancedConnection ? "Hide developer settings" : "Advanced developer settings"}
          </button>
        </div>

        {connectionResult && (
          <p
            className={cn(
              "mb-3 rounded-lg border p-2.5 text-xs",
              connectionResult.ok
                ? "border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.08)] text-[var(--nv-ok)]"
                : "border-[rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.08)] text-[var(--nv-warn)]",
            )}
          >
            {connectionResult.message}
          </p>
        )}

        {showAdvancedConnection && (
          <div className="mt-3 border-t border-[var(--nv-border)] pt-3">
            <label className="mb-1.5 block text-xs font-medium text-[var(--nv-text)]">
              Custom Proxy / Local Endpoint Override
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="text"
                value={apiUrlInput}
                onChange={(e) => setApiUrlInput(e.target.value)}
                placeholder="Leave blank for automatic zero-config connection"
                className="w-full rounded-xl border border-[var(--nv-border)] bg-[rgba(10,16,28,0.4)] px-3.5 py-2 font-mono text-xs text-[var(--nv-text)] placeholder:text-[var(--nv-text-muted)] focus:border-[var(--nv-cyan)] focus:outline-none"
              />
              <div className="flex gap-2 shrink-0">
                <Button variant="primary" size="sm" onClick={handleSaveApiUrl}>
                  {apiSaved ? "Saved!" : "Save"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setApiUrlInput("");
                    update({ apiUrl: "" });
                    setConnectionResult(null);
                    setTimeout(() => void refresh(), 100);
                  }}
                >
                  Reset to Auto
                </Button>
              </div>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-[var(--nv-text-muted)]">Presets:</span>
              <button
                type="button"
                onClick={() => {
                  setApiUrlInput("");
                  update({ apiUrl: "" });
                  setConnectionResult(null);
                  setTimeout(() => void refresh(), 100);
                }}
                className="rounded-lg border border-[var(--nv-cyan)] bg-[rgba(66,232,245,0.08)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--nv-cyan)] transition"
              >
                ⚡ Automatic (Zero-Config)
              </button>
              <button
                type="button"
                onClick={() => {
                  setApiUrlInput("http://127.0.0.1:8000");
                  update({ apiUrl: "http://127.0.0.1:8000" });
                  setTimeout(() => void refresh(), 100);
                }}
                className="rounded-lg border border-[var(--nv-border)] px-2 py-0.5 text-[11px] text-[var(--nv-text-muted)] hover:text-[var(--nv-text)] hover:bg-[rgba(66,232,245,0.08)] transition"
              >
                Direct Localhost (8000)
              </button>
            </div>
          </div>
        )}

        <dl className="mt-4 space-y-2 border-t border-[var(--nv-border)] pt-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[var(--nv-text-muted)]">Connection mode</dt>
            <dd className="font-mono text-xs text-[var(--nv-text)]">
              {settings.apiUrl ? "Custom Override" : "Production Cloud (Auto-connected)"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[var(--nv-text-muted)]">Backend health</dt>
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
            <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--nv-violet)]" aria-hidden />
            Server provider credentials remain strictly on the backend. Personal BYOK keys stay in your browser.
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
