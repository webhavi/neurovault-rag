/// <reference types="vitest" />
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { SettingsProvider } from "@/hooks/useSettings";

function withProviders(ui: React.ReactNode) {
  return (
    <SettingsProvider>
      <MemoryRouter>{ui}</MemoryRouter>
    </SettingsProvider>
  );
}
import HeroPage from "@/features/hero/HeroPage";
import ChatWorkspace from "@/features/chat/ChatWorkspace";
import { ApiError } from "@/lib/api";
import type { ChatResponse } from "@/types";

vi.mock("@/hooks/useHealth", () => ({
  useHealth: () => ({
    health: null,
    reachable: true,
    loading: false,
    status: "online",
    refresh: vi.fn(),
  }),
}));

vi.mock("@/components/layout/TopBar", () => ({
  useStats: () => ({
    stats: {
      status: "ready",
      total_chunks: 42,
      documents: [{ source: "deeplearning.pdf", chunks: 30 }],
      embedding_model: "test",
      llm_model: "test",
      retrieval: { strategy: "mmr", k: 4 },
      collection_name: "langchain",
      generated_at: "2025-01-01T00:00:00Z",
    },
    error: null,
    loading: false,
  }),
}));

vi.mock("@/lib/api", async () => {
  const mod = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...mod, api: { ...mod.api, chat: vi.fn() } };
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("HeroPage", () => {
  it("renders the headline and example chips", () => {
    render(
withProviders(<HeroPage onAsk={vi.fn()} />),
    );
    expect(screen.getByText("Discover Intelligence.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /backpropagation/i }).length).toBeGreaterThan(0);
  });

  it("sends a real request when an example chip is clicked", async () => {
    const onAsk = vi.fn();
    const user = userEvent.setup();
    render(
withProviders(<HeroPage onAsk={onAsk} />),
    );
    await user.click(screen.getAllByRole("button", { name: /backpropagation/i })[0]);
    expect(onAsk).toHaveBeenCalledWith("Explain backpropagation in simple terms.");
  });

  it("submits typed questions via the form", async () => {
    const onAsk = vi.fn();
    const user = userEvent.setup();
    render(
withProviders(<HeroPage onAsk={onAsk} />),
    );
    const input = screen.getByLabelText(/your deep learning question/i);
    await user.type(input, "What is a GRU?");
    await user.keyboard("{Enter}");
    expect(onAsk).toHaveBeenCalledWith("What is a GRU?");
  });
});

const api = vi.mocked((await import("@/lib/api")).api, true);

const chatResponse: ChatResponse = {
  answer: "**Backpropagation** is the chain rule applied efficiently.",
  sources: [{ document: "deeplearning.pdf", page: 3, content_preview: "Backprop computes gradients…" }],
  retrieval: { strategy: "mmr", chunks_retrieved: 4, duration_ms: 42 },
  metadata: { duration_ms: 900, model: "openai/gpt-oss-120b", grounded: true, generation_ms: 850 },
};

describe("ChatWorkspace", () => {
  it("shows the empty state and lets the user submit a question", async () => {
    vi.mocked(api.chat).mockResolvedValue(chatResponse);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ChatWorkspace conversation={null} isSending={false} onSend={vi.fn()} onRegenerate={vi.fn()} rightOpen={false} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/start a research conversation/i)).toBeInTheDocument();
    const input = screen.getByLabelText(/question for the knowledge base/i);
    await user.type(input, "What is backpropagation?");
    await user.keyboard("{Enter}");
    expect(input).toHaveValue("");
  });

  it("renders answers with markdown and sources", async () => {
    vi.mocked(api.chat).mockResolvedValue(chatResponse);
    const convo = {
      id: "c1",
      title: "t",
      messages: [
        { id: "m1", role: "user" as const, content: "What is backpropagation?", status: "done" as const },
        {
          id: "m2",
          role: "assistant" as const,
          content: chatResponse.answer,
          status: "done" as const,
          sources: chatResponse.sources,
          retrieval: chatResponse.retrieval,
          metadata: chatResponse.metadata,
        },
      ],
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    };
    render(
      withProviders(
        <ChatWorkspace conversation={convo} isSending={false} onSend={vi.fn()} onRegenerate={vi.fn()} rightOpen={false} />
      ),
    );
    expect(screen.getByText("Backpropagation", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText(/retrieved sources · 1/i)).toBeInTheDocument();
    // expand the source accordion
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /deeplearning\.pdf/i }));
    await waitFor(() => expect(screen.getByText(/Backprop computes gradients/)).toBeInTheDocument());
  });

  it("shows a friendly error when the API fails", async () => {
    vi.mocked(api.chat).mockRejectedValue(
      new ApiError({ status: 503, code: "empty_vector_store", message: "No documents are indexed yet." }),
    );
    const onSend = vi.fn(async () => {
      throw new Error("unused");
    });
    render(
      withProviders(
        <ChatWorkspace
          conversation={{
            id: "c1",
            title: "t",
            messages: [
              { id: "m1", role: "assistant", content: "", status: "error", errorText: "No documents are indexed yet." },
            ],
            createdAt: "",
            updatedAt: "",
          }}
          isSending={false}
          onSend={onSend}
          onRegenerate={vi.fn()}
          rightOpen={false}
        />
      ),
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/no documents are indexed yet/i)).toBeInTheDocument();
  });

  it("handles cold start wake-up state with friendly UI and retry action", async () => {
    render(
      withProviders(
        <ChatWorkspace
          conversation={{
            id: "c1",
            title: "t",
            messages: [
              {
                id: "m1",
                role: "assistant",
                content: "",
                status: "error",
                errorText: "Waking up the service (this may take up to a minute on initial start). Please try again in a few moments.",
              },
            ],
            createdAt: "",
            updatedAt: "",
          }}
          isSending={false}
          onSend={vi.fn()}
          onRegenerate={vi.fn()}
          rightOpen={false}
        />
      ),
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/Waking Up AI Service/i)).toBeInTheDocument();
    expect(screen.getByText(/Waking up the service/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    // Ensures internal technical details are hidden
    expect(screen.queryByText(/port 8000/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Configure Backend URL in Settings/i)).not.toBeInTheDocument();
  });
});

