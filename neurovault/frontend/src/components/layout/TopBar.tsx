import { useEffect, useState } from "react";
import { Menu, PanelRightOpen, PanelRightClose } from "lucide-react";
import { api } from "@/lib/api";
import type { RetrievalConfigResponse, StatsResponse } from "@/types";

export default function TopBar({
  title,
  subtitle,
  onOpenMobileNav,
  showRightPanelToggle,
  rightPanelOpen,
  onToggleRightPanel,
}: {
  title: string;
  subtitle?: string;
  onOpenMobileNav: () => void;
  showRightPanelToggle?: boolean;
  rightPanelOpen?: boolean;
  onToggleRightPanel?: () => void;
}) {
  return (
    <header className="glass sticky top-0 z-30 flex h-14 items-center gap-3 rounded-none border-x-0 border-t-0 px-3 sm:px-5">
      <button
        type="button"
        onClick={onOpenMobileNav}
        className="rounded-lg p-2 text-[var(--nv-text-muted)] transition hover:text-[var(--nv-text)] lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-semibold text-[var(--nv-text)]">{title}</h1>
        {subtitle && <p className="truncate text-[11px] text-[var(--nv-text-muted)]">{subtitle}</p>}
      </div>
      {showRightPanelToggle && (
        <button
          type="button"
          onClick={onToggleRightPanel}
          className="rounded-lg p-2 text-[var(--nv-text-muted)] transition hover:text-[var(--nv-text)]"
          aria-label={rightPanelOpen ? "Hide intelligence panel" : "Show intelligence panel"}
          aria-pressed={rightPanelOpen}
        >
          {rightPanelOpen ? <PanelRightClose className="h-5 w-5" /> : <PanelRightOpen className="h-5 w-5" />}
        </button>
      )}
    </header>
  );
}

/** Knowledge-base stats with light polling (plain hooks, no query library). */
export function useStats() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const s = await api.stats();
        if (!cancelled) {
          setStats(s);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "stats unavailable");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const id = window.setInterval(load, 30_000);
    // Allow other views to request an immediate refresh after ingestion.
    const onInvalidated = () => void load();
    window.addEventListener("nv:stats-changed", onInvalidated);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("nv:stats-changed", onInvalidated);
    };
  }, []);

  return { stats, error, loading };
}

/** Ask all stats consumers to refresh immediately (e.g. after ingestion). */
export function invalidateStats() {
  window.dispatchEvent(new Event("nv:stats-changed"));
}

export function useConfig(): { config: RetrievalConfigResponse | null; error: string | null } {
  const [config, setConfig] = useState<RetrievalConfigResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api
      .retrievalConfig()
      .then(setConfig)
      .catch((e) => setError(e instanceof Error ? e.message : "config unavailable"));
  }, []);
  return { config, error };
}
