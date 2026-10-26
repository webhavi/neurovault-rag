import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { HealthResponse } from "@/types";

const POLL_INTERVAL_FAST = 2_500;
const POLL_INTERVAL_STEADY = 15_000;

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

    const scheduleNext = () => {
      const isConnected = reachable === true && health?.status === "ready";
      const interval = isConnected ? POLL_INTERVAL_STEADY : POLL_INTERVAL_FAST;
      timer.current = window.setTimeout(async () => {
        await refresh();
        scheduleNext();
      }, interval);
    };

    scheduleNext();

    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh, reachable, health?.status]);

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
