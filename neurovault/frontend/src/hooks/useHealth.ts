import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { HealthResponse } from "@/types";

const POLL_MS = 12_000;

/** Polls backend health; exposes a stable connection summary for the UI. */
export function useHealth() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const timer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const body = await api.health();
      setHealth(body);
      setReachable(true);
    } catch {
      setReachable(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    timer.current = window.setInterval(() => void refresh(), POLL_MS);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [refresh]);

  const status: "online" | "degraded" | "offline" | "checking" =
    reachable === null || loading
      ? "checking"
      : reachable === false
        ? "offline"
        : health?.status === "ready"
          ? "online"
          : health?.status === "initializing"
            ? "checking"
            : "degraded";

  return { health, reachable, loading, status, refresh };
}
