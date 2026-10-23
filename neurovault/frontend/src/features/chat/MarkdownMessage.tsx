/** Markdown-rendered assistant answers with syntax-highlighted code blocks. */
import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy } from "lucide-react";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          /* clipboard unavailable */
        }
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      }}
      className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-[var(--nv-text-muted)] transition hover:bg-[rgba(102,136,190,0.12)] hover:text-[var(--nv-text)]"
      aria-label="Copy code"
    >
      {copied ? <Check className="h-3 w-3 text-[var(--nv-ok)]" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

const MarkdownMessage = memo(function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="md-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        components={{
          pre({ children, ...props }) {
            // Extract raw text for the copy button.
            let raw = "";
            const child = Array.isArray(children) ? children[0] : children;
            if (child && typeof child === "object" && "props" in (child as Record<string, unknown>)) {
              const inner = (child as { props?: { children?: unknown } }).props?.children;
              if (typeof inner === "string") raw = inner;
              else if (Array.isArray(inner)) raw = inner.filter((c) => typeof c === "string").join("");
            }
            return (
              <div className="my-2 overflow-hidden rounded-xl border border-[var(--nv-border)] bg-[rgba(7,10,18,0.75)]">
                <div className="flex items-center justify-between border-b border-[var(--nv-border)] bg-[rgba(102,136,190,0.07)] px-3 py-1.5">
                  <span className="font-mono text-[10.5px] uppercase tracking-wider text-[var(--nv-text-muted)]">
                    code
                  </span>
                  <CopyButton text={raw} />
                </div>
                <pre {...props}>{children}</pre>
              </div>
            );
          },
          a({ href, children }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

export default MarkdownMessage;
