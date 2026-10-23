import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  BrainCircuit,
  Database,
  GitBranch,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Settings as SettingsIcon,
  Trash2,
  Waves,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSettings } from "@/hooks/useSettings";
import type { Conversation } from "@/hooks/useChat";

export type ViewKey = "home" | "chat" | "knowledge" | "retrieval" | "embeddings" | "settings";
export type ConnectionStatus = "online" | "degraded" | "offline" | "checking";

interface SidebarProps {
  view: ViewKey;
  conversations: Conversation[];
  activeId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  status: ConnectionStatus;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV: { key: ViewKey; label: string; icon: typeof Database }[] = [
  { key: "knowledge", label: "Knowledge Library", icon: Database },
  { key: "retrieval", label: "Retrieval Explorer", icon: GitBranch },
  { key: "embeddings", label: "Embedding Space", icon: Waves },
  { key: "settings", label: "Settings", icon: SettingsIcon },
];

export default function Sidebar({
  view,
  conversations,
  activeId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  status,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const { settings, update } = useSettings();
  const collapsed = settings.sidebarCollapsed && !mobileOpen;
  const navigate = useNavigate();

  const go = (key: ViewKey) => {
    navigate(`/view/${key}`);
    onCloseMobile();
  };

  return (
    <>
      {/* mobile scrim */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onCloseMobile}
          aria-hidden
        />
      )}
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 74 : 264 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className={cn(
          "glass fixed inset-y-0 left-0 z-50 flex flex-col rounded-none border-y-0 border-l-0 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
        aria-label="Primary navigation"
      >
        {/* logo */}
        <div className="flex items-center gap-2.5 px-4 py-4">
          <button
            type="button"
            onClick={() => go("home")}
            className="flex min-w-0 items-center gap-2.5 rounded-lg p-1 text-left"
            aria-label="NeuroVault home"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[rgba(66,232,245,0.2)] to-[rgba(152,117,255,0.25)] shadow-glowCyan">
              <BrainCircuit className="h-5 w-5 text-[var(--nv-cyan)]" aria-hidden />
            </span>
            {!collapsed && (
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-bold tracking-tight text-[var(--nv-text)]">
                  NeuroVault
                </span>
                <span className="block truncate text-[10px] uppercase tracking-[0.18em] text-[var(--nv-text-muted)]">
                  Intelligence Lab
                </span>
              </span>
            )}
          </button>
        </div>

        {/* new conversation */}
        <div className="px-3">
          <button
            type="button"
            onClick={() => {
              onNewConversation();
              go("chat");
            }}
            className={cn(
              "group flex h-10 w-full items-center gap-2.5 rounded-xl border border-[var(--nv-border-strong)] bg-[rgba(66,232,245,0.07)] px-3 text-sm font-medium text-[var(--nv-text)] transition hover:border-[var(--nv-cyan)] hover:bg-[rgba(66,232,245,0.12)]",
              collapsed && "justify-center px-0",
            )}
            aria-label="New conversation"
          >
            <MessageSquarePlus className="h-4 w-4 shrink-0 text-[var(--nv-cyan)]" aria-hidden />
            {!collapsed && "New conversation"}
          </button>
        </div>

        {/* conversations */}
        {!collapsed && (
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-3">
            <p className="px-1 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--nv-text-muted)]">
              Recent conversations
              <span className="ml-1.5 normal-case tracking-normal text-[10px] text-[var(--nv-text-muted)] opacity-80">
                · stored locally
              </span>
            </p>
            <ul className="space-y-0.5" aria-label="Recent conversations">
              {conversations.length === 0 && (
                <li className="px-1 py-2 text-xs text-[var(--nv-text-muted)]">
                  No conversations yet.
                </li>
              )}
              {conversations.map((c) => (
                <li key={c.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectConversation(c.id);
                      go("chat");
                    }}
                    className={cn(
                      "flex h-9 w-full items-center rounded-lg px-2.5 pr-8 text-left text-[13px] transition",
                      view === "chat" && activeId === c.id
                        ? "bg-[rgba(66,232,245,0.1)] text-[var(--nv-text)]"
                        : "text-[var(--nv-text-muted)] hover:bg-[rgba(102,136,190,0.09)] hover:text-[var(--nv-text)]",
                    )}
                    aria-current={view === "chat" && activeId === c.id ? "page" : undefined}
                  >
                    <span className="truncate">{c.title}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteConversation(c.id);
                    }}
                    className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-[var(--nv-text-muted)] opacity-0 transition hover:text-[var(--nv-danger)] group-hover:opacity-100 focus-visible:opacity-100"
                    aria-label={`Delete conversation: ${c.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {collapsed && <div className="flex-1" />}

        {/* nav */}
        <nav className="border-t border-[var(--nv-border)] px-3 py-3">
          <ul className="space-y-0.5">
            {NAV.map(({ key, label, icon: Icon }) => (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => go(key)}
                  className={cn(
                    "flex h-10 w-full items-center gap-2.5 rounded-xl px-3 text-[13px] font-medium transition",
                    view === key
                      ? "bg-[rgba(152,117,255,0.12)] text-[var(--nv-text)]"
                      : "text-[var(--nv-text-muted)] hover:bg-[rgba(102,136,190,0.09)] hover:text-[var(--nv-text)]",
                    collapsed && "justify-center px-0",
                  )}
                  aria-current={view === key ? "page" : undefined}
                  title={collapsed ? label : undefined}
                >
                  <Icon
                    className={cn("h-4 w-4 shrink-0", view === key ? "text-[var(--nv-violet)]" : "")}
                    aria-hidden
                  />
                  {!collapsed && label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* footer: status + collapse */}
        <div className="flex items-center justify-between border-t border-[var(--nv-border)] px-3 py-3">
          <StatusDot status={status} compact={collapsed} />
          <button
            type="button"
            onClick={() => update({ sidebarCollapsed: !collapsed })}
            className="hidden rounded-lg p-2 text-[var(--nv-text-muted)] transition hover:bg-[rgba(102,136,190,0.1)] hover:text-[var(--nv-text)] lg:block"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
      </motion.aside>
    </>
  );
}

export function StatusDot({ status, compact }: { status: ConnectionStatus; compact?: boolean }) {
  const map: Record<ConnectionStatus, { color: string; label: string }> = {
    online: { color: "bg-[var(--nv-ok)]", label: "Backend connected" },
    degraded: { color: "bg-[var(--nv-warn)]", label: "Backend degraded" },
    offline: { color: "bg-[var(--nv-danger)]", label: "Backend offline" },
    checking: { color: "bg-[var(--nv-cyan)] animate-pulse", label: "Checking backend…" },
  };
  const s = map[status];
  return (
    <span className="flex min-w-0 items-center gap-2" title={s.label}>
      <span className={cn("h-2 w-2 shrink-0 rounded-full", s.color)} aria-hidden />
      {!compact && <span className="truncate text-[11px] text-[var(--nv-text-muted)]">{s.label}</span>}
    </span>
  );
}
