import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Theme = "dark" | "light";
export type MotionPref = "system" | "reduced" | "full";

export type ByokProvider = "groq" | "openai" | "gemini";

export interface Settings {
  theme: Theme;
  enable3D: boolean;
  motion: MotionPref;
  sidebarCollapsed: boolean;
  showSourcePreviews: boolean;
  byokKey: string;
  byokProvider: ByokProvider;
  byokModel: string;
}

const DEFAULTS: Settings = {
  theme: "dark",
  enable3D: true,
  motion: "system",
  sidebarCollapsed: false,
  showSourcePreviews: true,
  byokKey: "",
  byokProvider: "groq",
  byokModel: "",
};

const STORAGE_KEY = "nv.settings.v1";

interface SettingsContextValue {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
  /** Effective reduced-motion decision (media query + explicit pref). */
  reducedMotion: boolean;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return DEFAULTS;
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(load);
  const [mediaReduced, setMediaReduced] = useState<boolean>(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (e: MediaQueryListEvent) => setMediaReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* storage unavailable — preferences stay session-only */
    }
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.dataset.motion = settings.motion === "reduced" ? "reduced" : "full";
  }, [settings]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      update: (patch) => setSettings((s) => ({ ...s, ...patch })),
      reset: () => setSettings(DEFAULTS),
      reducedMotion: settings.motion === "reduced" || (settings.motion === "system" && mediaReduced),
    }),
    [settings, mediaReduced],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}
