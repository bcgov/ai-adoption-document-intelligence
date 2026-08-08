/**
 * Regression tests for the agent chat drawer's chrome, from Inderdeep Singh's
 * 2026-08-06 UX walkthrough:
 *
 *  - item 26: the stop control belongs to the conversation, not the panel —
 *    the composer's send button becomes stop while a turn streams and reverts
 *    when it ends, and the header-level abort button is gone.
 *  - item 30: the model picker sits at the composer (where the user is
 *    looking while typing) and "past conversations" is opened from the header
 *    group, beside new-conversation and close.
 *
 * assistant-ui's runtime is stubbed: these are questions about which control
 * renders in which container, and the real runtime would only add a network
 * transport and a streaming state machine we would then have to drive.
 */

import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentChatDrawer } from "./AgentChatDrawer";
import { useAgentChatStore } from "./store";

/** Drives the stubbed `useAuiState` selector; flipped per test. */
const threadState = { isRunning: false };

vi.mock("@assistant-ui/react", () => ({
  AssistantRuntimeProvider: ({ children }: { children?: ReactNode }) => (
    <>{children}</>
  ),
  ComposerPrimitive: {
    Root: ({
      children,
      ...rest
    }: ComponentProps<"form"> & { children?: ReactNode }) => (
      <form {...rest}>{children}</form>
    ),
    Input: (props: ComponentProps<"textarea">) => <textarea {...props} />,
    // `asChild` in the real primitive slots props onto the child; the child
    // is what the tests care about, so render it directly.
    Send: ({ children }: { children?: ReactNode }) => <>{children}</>,
    Cancel: ({ children }: { children?: ReactNode }) => <>{children}</>,
  },
  MessagePrimitive: { Parts: () => null },
  ThreadPrimitive: {
    Viewport: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    Empty: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    Messages: () => null,
  },
  useAssistantRuntime: () => null,
  useAuiState: <T,>(selector: (state: { thread: typeof threadState }) => T) =>
    selector({ thread: threadState }),
}));

vi.mock("@assistant-ui/react-ai-sdk", () => ({
  useChatRuntime: () => ({}),
}));

vi.mock("../../auth/GroupContext", () => ({
  useGroup: () => ({ activeGroup: { id: "group-1" } }),
}));

vi.mock("./useAgentConversations", () => ({
  useAgentConversations: () => ({ data: [], isFetching: false }),
  getAgentAuthHeaders: () => ({}),
  fetchAgentConversation: vi.fn(),
}));

function renderDrawer() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/workflows/wf-1/edit"]}>
          <AgentChatDrawer />
        </MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

beforeEach(() => {
  threadState.isRunning = false;
  useAgentChatStore.setState({ isOpen: true, conversationId: "conv-1" });
});

afterEach(() => {
  useAgentChatStore.setState({ isOpen: false, conversationId: null });
  vi.unstubAllGlobals();
});

describe("item 26 — the composer's button is the stop control while streaming", () => {
  it("shows send, not stop, when no turn is running", () => {
    renderDrawer();
    const composer = within(screen.getByTestId("agent-chat-composer"));
    expect(composer.getByTestId("agent-chat-send")).toBeInTheDocument();
    expect(composer.queryByTestId("agent-chat-stop")).toBeNull();
  });

  it("shows stop, not send, while a turn is running", () => {
    threadState.isRunning = true;
    renderDrawer();
    const composer = within(screen.getByTestId("agent-chat-composer"));
    expect(composer.getByTestId("agent-chat-stop")).toBeInTheDocument();
    expect(composer.queryByTestId("agent-chat-send")).toBeNull();
  });

  it("no longer renders a panel-level abort button in the header", () => {
    threadState.isRunning = true;
    renderDrawer();
    expect(screen.queryByTestId("agent-chat-abort")).toBeNull();
  });

  it("still tells the backend to abort the current conversation", () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetchMock);
    threadState.isRunning = true;
    renderDrawer();

    fireEvent.click(screen.getByTestId("agent-chat-stop"));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/agent/conversations/conv-1/abort",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("item 30 — panel layout", () => {
  it("renders the model picker inside the composer, not the header", () => {
    renderDrawer();
    const composer = within(screen.getByTestId("agent-chat-composer"));
    expect(composer.getByTestId("agent-chat-model-picker")).toBeInTheDocument();
  });

  it("opens past conversations from the header group", () => {
    renderDrawer();
    expect(screen.queryByTestId("agent-chat-conversation-switcher")).toBeNull();

    fireEvent.click(screen.getByTestId("agent-chat-history-toggle"));

    expect(
      screen.getByTestId("agent-chat-conversation-switcher"),
    ).toBeInTheDocument();
  });

  it("groups the history toggle with new-conversation and close", () => {
    renderDrawer();
    const toggle = screen.getByTestId("agent-chat-history-toggle");
    const group = toggle.parentElement;
    expect(group).not.toBeNull();
    expect(
      within(group as HTMLElement).getByTestId("agent-chat-reset"),
    ).toBeInTheDocument();
    expect(
      within(group as HTMLElement).getByTestId("agent-chat-close"),
    ).toBeInTheDocument();
  });
});
