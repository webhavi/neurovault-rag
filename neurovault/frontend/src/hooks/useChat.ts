import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type {
  ChatMessagePayload,
  ChatResponse,
  IngestJobStatus,
  SourceRef,
} from "@/types";

/* ------------------------------------------------------------------ */
/* Locally stored conversations                                        */
/* ------------------------------------------------------------------ */

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "done" | "loading" | "error";
  errorText?: string;
  sources?: SourceRef[];
  retrieval?: ChatResponse["retrieval"];
  metadata?: ChatResponse["metadata"];
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

const CONVO_KEY = "nv.conversations.v1";

/**
 * Conversations live ONLY in this browser's localStorage. They are not
 * synchronized with the server, and the UI must keep labelling them as
 * "stored locally".
 */
function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(CONVO_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Conversation[];
    if (!Array.isArray(parsed)) return [];
    // Never persist in-flight loading bubbles across reloads.
    return parsed.map((c) => ({
      ...c,
      messages: c.messages
        .filter((m) => m.status !== "loading")
        .map((m) => (m.status === "error" ? { ...m, status: "done" as const } : m)),
    }));
  } catch {
    return [];
  }
}

function persist(list: Conversation[]) {
  try {
    localStorage.setItem(CONVO_KEY, JSON.stringify(list.slice(0, 40)));
  } catch {
    /* storage full/unavailable */
  }
}

function newConversation(): Conversation {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: "New conversation",
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

/* ------------------------------------------------------------------ */
/* The chat hook                                                       */
/* ------------------------------------------------------------------ */

export function useChat() {
  const [conversations, setConversations] = useState<Conversation[]>(loadConversations);
  const [activeId, setActiveId] = useState<string | null>(() => loadConversations()[0]?.id ?? null);
  const [isSending, setIsSending] = useState(false);
  const sendingRef = useRef(false);

  useEffect(() => {
    persist(conversations);
  }, [conversations]);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  const patchConversation = useCallback((id: string, patch: (c: Conversation) => Conversation) => {
    setConversations((list) => list.map((c) => (c.id === id ? patch(c) : c)));
  }, []);

  const startConversation = useCallback(() => {
    const convo = newConversation();
    setConversations((list) => [convo, ...list]);
    setActiveId(convo.id);
    return convo;
  }, []);

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((list) => {
        const next = list.filter((c) => c.id !== id);
        if (activeId === id) setActiveId(next[0]?.id ?? null);
        return next;
      });
    },
    [activeId],
  );

  const clearAll = useCallback(() => {
    setConversations([]);
    setActiveId(null);
  }, []);

  /** Sends a question through the real backend. Guards duplicate submits. */
  const send = useCallback(
    async (rawQuestion: string, convoId?: string) => {
      const question = rawQuestion.trim();
      if (!question || sendingRef.current) return;
      sendingRef.current = true;
      setIsSending(true);

      let targetId = convoId ?? activeId;
      if (!targetId || !conversations.some((c) => c.id === targetId)) {
        const convo = newConversation();
        targetId = convo.id;
        setConversations((list) => [convo, ...list]);
        setActiveId(convo.id);
      }

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: question,
        status: "done",
      };
      const pendingId = crypto.randomUUID();

      patchConversation(targetId, (c) => ({
        ...c,
        title:
          c.messages.length === 0
            ? question.length > 42
              ? `${question.slice(0, 42)}…`
              : question
            : c.title,
        messages: [
          ...c.messages,
          userMsg,
          { id: pendingId, role: "assistant", content: "", status: "loading" },
        ],
        updatedAt: new Date().toISOString(),
      }));

      const history: ChatMessagePayload[] = (conversations.find((c) => c.id === targetId)?.messages ?? [])
        .filter((m) => m.status === "done")
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }));

      // Resolve BYOK key, provider, and model from local settings if configured
      let byokKey: string | undefined;
      let byokProvider: string | undefined;
      let byokModel: string | undefined;
      try {
        const rawSettings = localStorage.getItem("nv.settings.v1");
        if (rawSettings) {
          const parsed = JSON.parse(rawSettings) as {
            byokKey?: string;
            byokProvider?: string;
            byokModel?: string;
          };
          if (parsed.byokKey && typeof parsed.byokKey === "string" && parsed.byokKey.trim()) {
            byokKey = parsed.byokKey.trim();
            byokProvider = parsed.byokProvider;
            byokModel = parsed.byokModel;
          }
        }
      } catch {
        /* storage read fallback */
      }

      try {
        const res = await api.chat(
          {
            question,
            session_id: targetId,
            history,
            byok_api_key: byokKey,
            byok_provider: byokProvider,
            byok_model: byokModel,
          },
          byokKey,
          byokProvider,
          byokModel,
        );
        patchConversation(targetId, (c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.id === pendingId
              ? {
                  ...m,
                  content: res.answer,
                  status: "done",
                  sources: res.sources,
                  retrieval: res.retrieval,
                  metadata: res.metadata,
                }
              : m,
          ),
          updatedAt: new Date().toISOString(),
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unexpected error.";
        patchConversation(targetId, (c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.id === pendingId ? { ...m, status: "error", errorText: message, content: "" } : m,
          ),
          updatedAt: new Date().toISOString(),
        }));
      } finally {
        sendingRef.current = false;
        setIsSending(false);
      }
    },
    [activeId, conversations, patchConversation],
  );

  /** Regenerate = re-run the pipeline for the last user question (real re-execution). */
  const regenerate = useCallback(async () => {
    if (!active || sendingRef.current) return;
    const lastUser = [...active.messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    // Drop trailing assistant bubbles, then re-send.
    const trimmed = [...active.messages];
    while (trimmed.length && trimmed[trimmed.length - 1].role === "assistant") trimmed.pop();
    patchConversation(active.id, (c) => ({ ...c, messages: trimmed }));
    await send(lastUser.content, active.id);
  }, [active, patchConversation, send]);

  return {
    conversations,
    active,
    activeId,
    setActiveId,
    startConversation,
    deleteConversation,
    clearAll,
    send,
    regenerate,
    isSending,
  };
}

/* ------------------------------------------------------------------ */
/* Ingestion job polling                                               */
/* ------------------------------------------------------------------ */

export function useIngestJobs(poll: boolean) {
  const [jobs, setJobs] = useState<IngestJobStatus[]>([]);
  const active = useRef(false);

  useEffect(() => {
    if (!poll) return;
    let stopped = false;
    const tick = async () => {
      try {
        const list = await api.ingestJobs();
        if (!stopped) setJobs(list);
        active.current = list.some((j) => j.status === "queued" || j.status === "processing");
      } catch {
        /* backend unreachable; keep previous state */
      }
    };
    void tick();
    const interval = window.setInterval(tick, active.current ? 800 : 2500);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [poll]);

  return jobs;
}
