import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "outline" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-gradient-to-r from-[#1fb6c4] to-[#6c4bd8] text-[#04121c] font-semibold shadow-glowCyan hover:brightness-110 active:brightness-95 border border-[rgba(66,232,245,0.35)]",
  outline:
    "border border-[var(--nv-border-strong)] text-[var(--nv-text)] hover:border-[var(--nv-cyan)] hover:bg-[rgba(66,232,245,0.06)]",
  ghost: "text-[var(--nv-text-muted)] hover:text-[var(--nv-text)] hover:bg-[rgba(102,136,190,0.1)]",
  danger:
    "border border-[rgba(248,113,113,0.4)] text-[var(--nv-danger)] hover:bg-[rgba(248,113,113,0.08)]",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-2.5 text-xs gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-6 text-[15px] gap-2.5 rounded-xl",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center whitespace-nowrap transition-all duration-150",
        "disabled:cursor-not-allowed disabled:opacity-55",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});
