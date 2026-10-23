/** Bottom question composer: Enter submits, Shift+Enter inserts a newline. */
import { useEffect, useRef, useState } from "react";
import { SendHorizonal } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EXAMPLE_QUESTIONS } from "@/features/hero/HeroPage";

const MAX_LEN = 4000;

export default function Composer({
  onSend,
  isSending,
  showExamples,
  autoFocus,
}: {
  onSend: (q: string) => void;
  isSending: boolean;
  showExamples: boolean;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const submit = () => {
    const q = value.trim();
    if (!q || isSending) return;
    onSend(q);
    setValue("");
    requestAnimationFrame(resize);
  };

  return (
    <div className="safe-bottom mx-auto w-full max-w-3xl px-3 pb-3 sm:px-4">
      {showExamples && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {EXAMPLE_QUESTIONS.slice(0, 3).map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => {
                setValue(q);
                ref.current?.focus();
              }}
              className="rounded-full border border-[var(--nv-border)] bg-[rgba(15,22,44,0.5)] px-2.5 py-1 text-[11px] text-[var(--nv-text-muted)] transition hover:border-[var(--nv-cyan)] hover:text-[var(--nv-text)]"
            >
              {q}
            </button>
          ))}
        </div>
      )}
      <form
        className="glass glass-bright flex items-end gap-2 rounded-2xl p-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="composer-input" className="sr-only">
          Question for the knowledge base
        </label>
        <textarea
          id="composer-input"
          ref={ref}
          rows={1}
          value={value}
          maxLength={MAX_LEN}
          placeholder="Ask about your deep learning documents…  (Enter to send · Shift+Enter for a new line)"
          onChange={(e) => {
            setValue(e.target.value);
            resize();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          className="max-h-40 min-h-[42px] flex-1 resize-none rounded-xl border border-transparent bg-transparent px-3 py-2.5 text-sm leading-relaxed text-[var(--nv-text)] placeholder:text-[var(--nv-text-muted)] focus:outline-none"
        />
        <div className="flex flex-col items-end gap-1 pb-0.5">
          <span
            className={`text-[10px] tabular-nums ${value.length > 3800 ? "text-[var(--nv-warn)]" : "text-transparent"}`}
            aria-hidden
          >
            {value.length}/{MAX_LEN}
          </span>
          <Button
            type="submit"
            size="md"
            loading={isSending}
            disabled={!value.trim() || isSending}
            icon={<SendHorizonal className="h-4 w-4" aria-hidden />}
            className="min-h-[42px]"
            aria-label="Send question"
          >
            <span className="hidden sm:inline">Ask</span>
          </Button>
        </div>
      </form>
      <p className="mt-1.5 px-1 text-center text-[10.5px] text-[var(--nv-text-muted)]">
        Answers are generated only from your indexed documents. Conversations are stored locally in
        this browser.
      </p>
    </div>
  );
}
