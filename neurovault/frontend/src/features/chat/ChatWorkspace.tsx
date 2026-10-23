/** The main research workspace: conversation header + messages + composer. */
import { useEffect, useMemo, useRef } from "react";
import Composer from "./Composer";
import MessageBubble from "./MessageBubble";
import IntelligencePanel from "./IntelligencePanel";
import { EmptyState } from "@/components/ui/Primitives";
import { MessagesSquare } from "lucide-react";
import type { Conversation } from "@/hooks/useChat";

export default function ChatWorkspace({
  conversation,
  isSending,
  onSend,
  onRegenerate,
  rightOpen,
}: {
  conversation: Conversation | null;
  isSending: boolean;
  onSend: (q: string) => void;
  onRegenerate: () => void;
  rightOpen: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastAssistant = useMemo(
    () => [...(conversation?.messages ?? [])].reverse().find((m) => m.role === "assistant") ?? null,
    [conversation],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [conversation?.messages.length, conversation?.messages[conversation.messages.length - 1]?.status]);

  return (
    <div className="relative flex min-h-0 flex-1">
      {/* messages column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-3 py-5 sm:px-6" aria-live="polite">
          {!conversation || conversation.messages.length === 0 ? (
            <div className="mx-auto flex h-full max-w-3xl items-center">
              <EmptyState
                icon={<MessagesSquare className="h-6 w-6" aria-hidden />}
                title="Start a research conversation"
                hint="Ask a question about your indexed deep learning documents. Every answer is grounded in retrieved chunks — sources appear under each response."
              />
            </div>
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-5">
              {conversation.messages.map((m, idx) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  showFollowUps={m.role === "assistant" && m.status === "done" && idx === conversation.messages.length - 1}
                  onFollowUp={onSend}
                  onRegenerate={onRegenerate}
                  canRegenerate={m.role === "assistant" && !isSending}
                  isSending={isSending}
                />
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
        <Composer onSend={onSend} isSending={isSending} showExamples={!conversation || conversation.messages.length === 0} autoFocus />
      </div>

      {/* right intelligence panel — static column on xl, drawer below */}
      {rightOpen && (
        <aside
          className="glass absolute inset-y-0 right-0 z-20 w-[min(92vw,340px)] overflow-hidden border-y-0 border-r-0 xl:static xl:z-auto xl:w-[340px] xl:shrink-0"
          aria-label="Intelligence panel"
        >
          <IntelligencePanel lastAssistant={lastAssistant} />
        </aside>
      )}
    </div>
  );
}
