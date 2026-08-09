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
 *  - item 22: a failed turn renders a visible error in the conversation,
 *    naming the cause the backend gave.
 *
 * assistant-ui's runtime is stubbed: these are questions about which control
 * renders in which container, and the real runtime would only add a network
 * transport and a streaming state machine we would then have to drive.
 */

import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentChatDrawer } from "./AgentChatDrawer";
import { type AgentModelOption, useAgentChatStore } from "./store";

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

/** Captures the options the drawer hands the runtime, so a test can fire
 *  the `onError` the AI SDK would fire on a failed turn. */
const runtimeOptions = vi.hoisted(() => ({
  current: null as { onError?: (error: unknown) => void } | null,
}));

vi.mock("@assistant-ui/react-ai-sdk", () => ({
  useChatRuntime: (options: { onError?: (error: unknown) => void }) => {
    runtimeOptions.current = options;
    return {};
  },
}));

vi.mock("../../auth/GroupContext", () => ({
  useGroup: () => ({ activeGroup: { id: "group-1" } }),
}));

vi.mock("./useAgentConversations", () => ({
  useAgentConversations: () => ({ data: [], isFetching: false }),
  getAgentAuthHeaders: () => ({}),
  fetchAgentConversation: vi.fn(),
}));

/** Stands in for `GET /api/agent/models`; each test sets the shape it wants. */
interface ModelsQueryState {
  data: AgentModelOption[] | undefined;
  isPending: boolean;
  isError: boolean;
}

const modelsQuery = vi.hoisted(() => ({
  current: {
    data: [],
    isPending: false,
    isError: false,
  } as {
    data:
      | Array<{
          label: string;
          provider: "azure" | "anthropic";
          model: string;
          isDefault: boolean;
        }>
      | undefined;
    isPending: boolean;
    isError: boolean;
  },
}));

// Only the network half is stubbed: `resolveEffectiveModel` is the logic
// under test here and stays real.
vi.mock("./useAgentModels", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./useAgentModels")>()),
  useAgentModels: () => modelsQuery.current,
}));

function setModels(state: Partial<ModelsQueryState>) {
  modelsQuery.current = {
    data: [],
    isPending: false,
    isError: false,
    ...state,
  };
}

function drawerTree() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/workflows/wf-1/edit"]}>
          <AgentChatDrawer />
        </MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>
  );
}

function renderDrawer() {
  return render(drawerTree());
}

const AZURE_ONLY: AgentModelOption[] = [
  {
    label: "Azure OpenAI — gpt-4o",
    provider: "azure",
    model: "gpt-4o",
    isDefault: true,
  },
];

beforeEach(() => {
  runtimeOptions.current = null;
  threadState.isRunning = false;
  setModels({ data: AZURE_ONLY });
  useAgentChatStore.setState({
    isOpen: true,
    conversationId: "conv-1",
    selectedModel: null,
  });
});

afterEach(() => {
  useAgentChatStore.setState({
    isOpen: false,
    conversationId: null,
    selectedModel: null,
  });
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

describe("item 23 — the picker offers only what the backend can serve", () => {
  const TWO_MODELS: AgentModelOption[] = [
    {
      label: "Azure OpenAI — gpt-4o",
      provider: "azure",
      model: "gpt-4o",
      isDefault: false,
    },
    {
      label: "Anthropic Claude — claude-haiku-4-5-20251001",
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      isDefault: true,
    },
  ];

  it("starts on the entry the backend flags as default, not the first one", () => {
    setModels({ data: TWO_MODELS });
    renderDrawer();

    // The old code took AGENT_MODEL_OPTIONS[0] — which is why gpt-5.4 went
    // out on every turn regardless of what the server had configured.
    const picker = screen.getByTestId("agent-chat-model-picker");
    expect(picker.tagName).toBe("INPUT");
    expect(picker).toHaveValue("Anthropic Claude — claude-haiku-4-5-20251001");
  });

  it("shows a static label, not a one-option dropdown, for a single model", () => {
    setModels({ data: AZURE_ONLY });
    renderDrawer();

    const picker = screen.getByTestId("agent-chat-model-picker");
    expect(picker.tagName).not.toBe("INPUT");
    expect(picker).toHaveTextContent("Azure OpenAI — gpt-4o");
  });

  it("never offers a model the backend did not report", () => {
    setModels({ data: AZURE_ONLY });
    renderDrawer();

    // Anthropic is still supported in the code and still documented; it is
    // simply not configured here, so it must not be selectable.
    expect(screen.queryByText(/Claude/i)).toBeNull();
    expect(screen.queryByText(/gpt-5\.4/i)).toBeNull();
  });

  it("says it is loading while the list is in flight", () => {
    setModels({ data: undefined, isPending: true });
    renderDrawer();

    expect(screen.getByTestId("agent-chat-model-picker")).toHaveTextContent(
      "Loading models…",
    );
  });

  it("stays sendable when the model list fails to load", () => {
    setModels({ data: undefined, isError: true });
    renderDrawer();

    expect(screen.getByTestId("agent-chat-model-picker")).toHaveTextContent(
      "Server default model",
    );
    // The composer is untouched: with no selection the turn carries no
    // provider/model and the backend applies its own default.
    const composer = within(screen.getByTestId("agent-chat-composer"));
    expect(composer.getByTestId("agent-chat-send")).toBeInTheDocument();
    expect(composer.getByTestId("agent-chat-textarea")).not.toBeDisabled();
  });

  it("ignores a stored pick the backend has stopped offering", () => {
    // A re-pointed deployment: the user's saved Anthropic choice is no
    // longer in the list, so the backend's default answers instead.
    useAgentChatStore.setState({ selectedModel: TWO_MODELS[1] });
    setModels({ data: AZURE_ONLY });
    renderDrawer();

    expect(screen.getByTestId("agent-chat-model-picker")).toHaveTextContent(
      "Azure OpenAI — gpt-4o",
    );
  });
});

describe("item 22 — a failed turn says what went wrong", () => {
  /** Fire the failure the AI SDK reports for a non-2xx `POST /agent/chat`: */
  function failTurn(body: string) {
    act(() => {
      runtimeOptions.current?.onError?.(new Error(body));
    });
  }

  it("renders nothing until a turn actually fails", () => {
    renderDrawer();
    expect(screen.queryByTestId("agent-chat-error")).toBeNull();
  });

  it("names an unconfigured provider inside the conversation", () => {
    renderDrawer();

    failTurn(
      JSON.stringify({
        statusCode: 503,
        code: "provider-not-configured",
        provider: "azure",
        message:
          "Provider 'azure' is not configured on this backend. Set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT, or pick a model from a provider that is configured.",
      }),
    );

    const alert = screen.getByTestId("agent-chat-error");
    expect(alert).toHaveTextContent(
      "That model is not configured on this server",
    );
    expect(alert).toHaveTextContent("Provider 'azure' is not configured");
    expect(alert).toHaveTextContent("provider-not-configured");
  });

  it("shows the error inside the thread, not as panel chrome", () => {
    renderDrawer();
    failTurn(JSON.stringify({ statusCode: 500, message: "boom" }));
    const thread = within(screen.getByTestId("agent-chat-thread"));
    expect(thread.getByTestId("agent-chat-error")).toBeInTheDocument();
  });

  it("surfaces a mid-stream provider rejection too", () => {
    renderDrawer();
    // Already-streaming failures arrive as the sentence the backend wrote
    // into the stream rather than as a JSON body.
    failTurn(
      "The model provider rejected the request (HTTP 401): the configured credential is not valid for this deployment.",
    );
    expect(screen.getByTestId("agent-chat-error")).toHaveTextContent(
      "HTTP 401",
    );
  });

  it("clears the error when the next turn starts", () => {
    renderDrawer();
    failTurn(JSON.stringify({ statusCode: 500, message: "boom" }));
    expect(screen.getByTestId("agent-chat-error")).toBeInTheDocument();

    // A new send flips the thread to running; the stale failure must not
    // sit under the answer to the next question. The header toggle is just
    // a cheap way to drive the re-render a real send would cause — the
    // drawer is NOT remounted, so the error clearing is the effect's doing
    // and not lost state.
    threadState.isRunning = true;
    fireEvent.click(screen.getByTestId("agent-chat-history-toggle"));

    expect(screen.queryByTestId("agent-chat-error")).toBeNull();
  });
});
