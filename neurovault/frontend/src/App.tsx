import { Suspense, lazy, useCallback, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import Sidebar, { type ViewKey } from "@/components/layout/Sidebar";
import TopBar, { useStats } from "@/components/layout/TopBar";
import HeroPage from "@/features/hero/HeroPage";
import ChatWorkspace from "@/features/chat/ChatWorkspace";

const KnowledgePage = lazy(() => import("@/features/knowledge/KnowledgePage"));
const RetrievalPage = lazy(() => import("@/features/retrieval/RetrievalPage"));
const EmbeddingSpacePage = lazy(() => import("@/features/embeddings/EmbeddingSpacePage"));
const SettingsPage = lazy(() => import("@/features/settings/SettingsPage"));
import { SettingsProvider } from "@/hooks/useSettings";
import { ToastProvider } from "@/hooks/useToasts";
import { useChat } from "@/hooks/useChat";
import { useSettings } from "@/hooks/useSettings";
import { useHealth } from "@/hooks/useHealth";

const VIEW_META: Record<ViewKey, { title: string; subtitle?: string }> = {
  home: { title: "NeuroVault — Deep Learning Intelligence Lab" },
  chat: { title: "Research Workspace", subtitle: "Grounded answers from your indexed documents" },
  knowledge: { title: "Knowledge Library", subtitle: "Documents, ingestion and index health" },
  retrieval: { title: "Retrieval Explorer", subtitle: "Live RAG pipeline monitor" },
  embeddings: { title: "3D Embedding Space", subtitle: "PCA projection of real retrieval vectors" },
  settings: { title: "Settings", subtitle: "Appearance, motion and connection" },
};

function Shell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(true);

  const chat = useChat();
  const { status } = useHealth();
  const { stats } = useStats();

  const currentView = (location.pathname.split("/view/")[1] ?? "home") as ViewKey;
  const meta = VIEW_META[currentView] ?? VIEW_META.home;

  const askFromHero = useCallback(
    (q: string) => {
      const convo = chat.startConversation();
      navigate("/view/chat");
      void chat.send(q, convo.id);
    },
    [chat, navigate],
  );

  const collectionLabel =
    stats?.documents && stats.documents.length > 0
      ? `chroma · ${stats.documents.length} docs · ${stats.total_chunks} chunks`
      : "chroma · empty index";

  return (
    <div className="flex min-h-screen bg-[var(--nv-bg)]">
      <Sidebar
        view={currentView}
        conversations={chat.conversations}
        activeId={chat.activeId}
        onSelectConversation={chat.setActiveId}
        onNewConversation={chat.startConversation}
        onDeleteConversation={chat.deleteConversation}
        status={status}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {currentView !== "home" && (
          <TopBar
            title={meta.title}
            subtitle={currentView === "chat" ? collectionLabel : meta.subtitle}
            onOpenMobileNav={() => setMobileNavOpen(true)}
            showRightPanelToggle={currentView === "chat"}
            rightPanelOpen={rightOpen}
            onToggleRightPanel={() => setRightOpen((v) => !v)}
          />
        )}
        <AnimatePresence mode="wait">
          <motion.main
            key={currentView}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <Suspense
              fallback={
                <div className="flex flex-1 items-center justify-center p-12 text-xs text-[var(--nv-text-muted)] animate-pulse">
                  Loading view…
                </div>
              }
            >
              {currentView === "home" && <HeroPage onAsk={askFromHero} />}
              {currentView === "chat" && (
                <ChatWorkspace
                  conversation={chat.active}
                  isSending={chat.isSending}
                  onSend={(q) => void chat.send(q)}
                  onRegenerate={() => void chat.regenerate()}
                  rightOpen={rightOpen}
                />
              )}
              {currentView === "knowledge" && <div className="overflow-y-auto"><KnowledgePage /></div>}
              {currentView === "retrieval" && <div className="overflow-y-auto"><RetrievalPage /></div>}
              {currentView === "embeddings" && <EmbeddingSpacePage />}
              {currentView === "settings" && (
                <div className="overflow-y-auto">
                  <SettingsPage onClearConversations={chat.clearAll} />
                </div>
              )}
            </Suspense>
          </motion.main>
        </AnimatePresence>
      </div>
    </div>
  );
}

function ThemedApp() {
  const { reducedMotion } = useSettings();
  return (
    <MotionConfig reducedMotion={reducedMotion ? "always" : "never"}>
      <Routes>
        <Route path="/" element={<Shell />} />
        <Route path="/view/:view" element={<Shell />} />
        <Route path="/chat" element={<Navigate to="/view/chat" replace />} />
        <Route path="/knowledge" element={<Navigate to="/view/knowledge" replace />} />
        <Route path="/library" element={<Navigate to="/view/knowledge" replace />} />
        <Route path="/retrieval" element={<Navigate to="/view/retrieval" replace />} />
        <Route path="/embeddings" element={<Navigate to="/view/embeddings" replace />} />
        <Route path="/settings" element={<Navigate to="/view/settings" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </MotionConfig>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <ToastProvider>
        <ThemedApp />
      </ToastProvider>
    </SettingsProvider>
  );
}
