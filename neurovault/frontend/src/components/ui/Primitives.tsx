import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({
  className,
  children,
  bright,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { bright?: boolean; children: ReactNode }) {
  return (
    <div className={cn("glass rounded-2xl", bright && "glass-bright", className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2
      className={cn(
        "text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--nv-text-muted)]",
        className,
      )}
    >
      {children}
    </h2>
  );
}

type BadgeTone = "cyan" | "violet" | "ok" | "warn" | "danger" | "muted";

const TONES: Record<BadgeTone, string> = {
  cyan: "border-[rgba(66,232,245,0.35)] bg-[rgba(66,232,245,0.08)] text-[var(--nv-cyan)]",
  violet: "border-[rgba(152,117,255,0.35)] bg-[rgba(152,117,255,0.1)] text-[var(--nv-violet)]",
  ok: "border-[rgba(74,222,128,0.35)] bg-[rgba(74,222,128,0.08)] text-[var(--nv-ok)]",
  warn: "border-[rgba(251,191,36,0.35)] bg-[rgba(251,191,36,0.08)] text-[var(--nv-warn)]",
  danger: "border-[rgba(248,113,113,0.35)] bg-[rgba(248,113,113,0.08)] text-[var(--nv-danger)]",
  muted: "border-[var(--nv-border)] bg-[rgba(102,136,190,0.08)] text-[var(--nv-text-muted)]",
};

export function Badge({
  tone = "muted",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-lg", className)} aria-hidden />;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-[rgba(66,232,245,0.25)] border-t-[var(--nv-cyan)]",
        className,
      )}
    />
  );
}

export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <div className="rounded-2xl border border-[var(--nv-border)] bg-[rgba(102,136,190,0.07)] p-3 text-[var(--nv-cyan)]">
        {icon}
      </div>
      <p className="text-sm font-medium text-[var(--nv-text)]">{title}</p>
      {hint && <p className="max-w-sm text-xs text-[var(--nv-text-muted)]">{hint}</p>}
    </div>
  );
}
