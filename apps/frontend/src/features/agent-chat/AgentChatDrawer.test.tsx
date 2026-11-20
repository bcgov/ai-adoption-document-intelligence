/**
 * Tests for the agent chat drawer's chrome:
 *
 *  - the stop control belongs to the conversation, not the panel — the
 *    composer's send button becomes stop while a turn streams and reverts
 *    when it ends, and the header has no abort button;
 *  - the model picker sits at the composer (where the user is looking while
 *    typing) and "past conversations" is opened from the header group, beside
 *    new-conversation and close;
 *  - a failed turn renders a visible error in the conversation, naming the
 *    cause the backend gave;
 *  - a server with no model provider says so, and its send is disabled with
 *    the reason reachable by mouse, keyboard and screen reader.
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
import type { AgentModelsResult } from "./useAgentModels";

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
  data: AgentModelsResult | undefined;
  isPending: boolean;
  isError: boolean;
}

const modelsQuery = vi.hoisted(() => ({
  current: {
    data: { items: [], missingConfig: [] },
    isPending: false,
    isError: false,
  } as {
    data:
      | {
          items: Array<{
            label: string;
            name: string;
            tier: string | null;
            provider: "azure" | "anthropic";
            model: string;
            isDefault: boolean;
          }>;
          missingConfig: Array<{
            provider: "azure" | "anthropic";
            variables: string[];
          }>;
        }
      | undefined;
    isPending: boolean;
    isError: boolean;
  },
}));

// Only the network half is stubbed: `resolveEffectiveModel` and
// `resolveAgentAvailability` are the logic under test here and stay real.
vi.mock("./useAgentModels", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./useAgentModels")>()),
  useAgentModels: () => modelsQuery.current,
}));

function setModels(state: Partial<ModelsQueryState>) {
  modelsQuery.current = {
    data: { items: [], missingConfig: [] },
    isPending: false,
    isError: false,
    ...state,
  };
}

/** The models response for a server offering exactly these models. */
function serving(items: AgentModelOption[]): AgentModelsResult {
  return { items, missingConfig: [] };
}

function drawerTree(route = "/workflows/wf-1/edit") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>
          <AgentChatDrawer />
        </MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>
  );
}

function renderDrawer(route?: string) {
  return render(drawerTree(route));
}

const AZURE_ONLY: AgentModelOption[] = [
  {
    label: "Azure OpenAI — gpt-4o",
    name: "gpt-4o",
    tier: "Balanced",
    provider: "azure",
    model: "gpt-4o",
    isDefault: true,
  },
];

beforeEach(() => {
  runtimeOptions.current = null;
  threadState.isRunning = false;
  setModels({ data: serving(AZURE_ONLY) });
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

describe("the composer's button is the stop control while streaming", () => {
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

describe("panel layout", () => {
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

const TWO_MODELS: AgentModelOption[] = [
  {
    label: "Azure OpenAI — gpt-4o",
    name: "gpt-4o",
    tier: "Balanced",
    provider: "azure",
    model: "gpt-4o",
    isDefault: false,
  },
  {
    label: "Anthropic Claude — claude-haiku-4-5-20251001",
    name: "Haiku 4.5",
    tier: "Fast",
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    isDefault: true,
  },
];

describe("the picker offers only what the backend can serve", () => {
  it("starts on the entry the backend flags as default, not the first one", () => {
    setModels({ data: serving(TWO_MODELS) });
    renderDrawer();

    // The backend's flag decides, not list order: the first entry is not
    // necessarily the model the server is configured to use.
    const picker = screen.getByTestId("agent-chat-model-picker");
    expect(picker).toHaveTextContent("Haiku 4.5");
    expect(picker).toHaveAttribute(
      "aria-label",
      "Model: Anthropic Claude — claude-haiku-4-5-20251001",
    );
  });

  it("shows a static label, not a menu trigger, for a single model", () => {
    setModels({ data: serving(AZURE_ONLY) });
    renderDrawer();

    const picker = screen.getByTestId("agent-chat-model-picker");
    expect(picker.tagName).not.toBe("BUTTON");
    expect(picker).toHaveTextContent("gpt-4o");
  });

  it("never offers a model the backend did not report", () => {
    setModels({ data: serving(AZURE_ONLY) });
    renderDrawer();

    // Anthropic is still supported in the code and still documented; it is
    // simply not configured here, so it must not be selectable.
    expect(screen.queryByText(/Claude/i)).toBeNull();
    expect(screen.queryByText(/Haiku/i)).toBeNull();
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
    expect(composer.getByTestId("agent-chat-send")).not.toBeDisabled();
    expect(composer.getByTestId("agent-chat-textarea")).not.toBeDisabled();
    // …and specifically NOT the unconfigured notice — a failed request is
    // not evidence that the server has no provider.
    expect(screen.queryByTestId("agent-chat-unconfigured")).toBeNull();
  });

  it("ignores a stored pick the backend has stopped offering", () => {
    // A re-pointed deployment: the user's saved Anthropic choice is no
    // longer in the list, so the backend's default answers instead.
    useAgentChatStore.setState({ selectedModel: TWO_MODELS[1] });
    setModels({ data: serving(AZURE_ONLY) });
    renderDrawer();

    expect(screen.getByTestId("agent-chat-model-picker")).toHaveTextContent(
      "gpt-4o",
    );
  });
});

/**
 * The composer's footer: attach `+` at the far left, the model name and its
 * tier immediately after it as a dropdown trigger, send at the right, and an
 * open menu listing each model with a one-line descriptor and a check on the
 * selected one.
 */
describe("the composer footer", () => {
  it("puts attach, then the model, then send in one strip", () => {
    setModels({ data: serving(TWO_MODELS) });
    renderDrawer();

    const attach = screen.getByTestId("agent-chat-attach");
    const picker = screen.getByTestId("agent-chat-model-picker");
    const send = screen.getByTestId("agent-chat-send");

    // Document order is left-to-right here: one flex row, no wrapping.
    expect(
      attach.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      picker.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows the model's short name and tier, not the long provider label", () => {
    setModels({ data: serving(TWO_MODELS) });
    renderDrawer();

    const picker = screen.getByTestId("agent-chat-model-picker");
    expect(picker).toHaveTextContent("Haiku 4.5");
    expect(picker).toHaveTextContent("Fast");
    // The long form stays as the accessible name, not as visible chrome.
    expect(picker.textContent).not.toContain("Anthropic Claude —");
  });

  it("lists every model with its descriptor, and checks the selected one", async () => {
    setModels({ data: serving(TWO_MODELS) });
    renderDrawer();

    fireEvent.click(screen.getByTestId("agent-chat-model-picker"));
    // The dropdown mounts through a transition, so it is not in the DOM on
    // the same tick as the click.
    await screen.findByTestId("agent-chat-model-menu");

    const menu = within(screen.getByTestId("agent-chat-model-menu"));
    expect(menu.getByTestId("agent-chat-model-option-azure")).toHaveTextContent(
      "Balanced",
    );
    const selected = menu.getByTestId("agent-chat-model-option-anthropic");
    expect(selected).toHaveTextContent("Haiku 4.5");
    expect(selected).toHaveTextContent("Fast");
    expect(selected.querySelector("svg")).not.toBeNull();
  });

  it("switches the model when a menu entry is chosen", async () => {
    setModels({ data: serving(TWO_MODELS) });
    renderDrawer();

    fireEvent.click(screen.getByTestId("agent-chat-model-picker"));
    fireEvent.click(await screen.findByTestId("agent-chat-model-option-azure"));

    expect(useAgentChatStore.getState().selectedModel?.model).toBe("gpt-4o");
  });

  it("draws the tier in gray.7, which reads at 6.5:1 on the composer's white", () => {
    // jsdom computes no colours, so this pins the token; the ratio itself was
    // measured in Chromium. `dimmed` (gray.6) measured 2.7:1 there.
    setModels({ data: serving(TWO_MODELS) });
    renderDrawer();

    expect(
      screen.getByTestId("agent-chat-model-tier").getAttribute("style"),
    ).toContain("color: var(--mantine-color-gray-7)");
  });

  it("shows the name alone for a model the backend gave no tier for", () => {
    // A privately-named Azure deployment: the backend refuses to invent a
    // tier for it, and the picker must not invent one either.
    setModels({
      data: serving([
        {
          label: "Azure OpenAI — bcgov-shared-gpt",
          name: "bcgov-shared-gpt",
          tier: null,
          provider: "azure",
          model: "bcgov-shared-gpt",
          isDefault: true,
        },
      ]),
    });
    renderDrawer();

    const picker = screen.getByTestId("agent-chat-model-picker");
    expect(picker).toHaveTextContent("bcgov-shared-gpt");
    expect(picker.textContent).not.toMatch(/Fast|Balanced|Deep reasoning/);
  });
});

/**
 * An empty model list means the server told us, successfully, that it has no
 * provider at all. A message typed there would go nowhere, so the drawer has
 * to say the assistant is unconfigured, and send nothing.
 */
describe("the assistant isn't configured on this server", () => {
  const MISSING = [
    { provider: "anthropic" as const, variables: ["ANTHROPIC_API_KEY"] },
    {
      provider: "azure" as const,
      variables: ["AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT"],
    },
  ];

  function renderUnconfigured() {
    setModels({ data: { items: [], missingConfig: MISSING } });
    return renderDrawer();
  }

  it("says so explicitly instead of naming a phantom default model", () => {
    renderUnconfigured();

    const notice = screen.getByTestId("agent-chat-unconfigured");
    expect(notice).toHaveTextContent(
      "The assistant isn't configured on this server",
    );
    expect(screen.getByTestId("agent-chat-model-picker")).toHaveTextContent(
      "No model configured",
    );
    expect(screen.queryByText("Server default model")).toBeNull();
  });

  it("names the missing variables the backend reported — names, never values", () => {
    renderUnconfigured();

    const notice = screen.getByTestId("agent-chat-unconfigured");
    expect(notice).toHaveTextContent("ANTHROPIC_API_KEY");
    expect(notice).toHaveTextContent(
      "AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT",
    );
    expect(notice).toHaveTextContent("docs-md/workflows/AGENT_SETUP.md");
  });

  it("disables send, with the reason reachable rather than implied", () => {
    renderUnconfigured();

    const composer = within(screen.getByTestId("agent-chat-composer"));
    expect(composer.getByTestId("agent-chat-send")).toBeDisabled();
    // The tooltip hangs off a focusable wrapper: a disabled Mantine button
    // fires no pointer or focus events, so a tooltip on the button itself
    // would be unreachable by both mouse and keyboard.
    const wrapper = composer.getByTestId("agent-chat-send-disabled-wrapper");
    expect(wrapper).toHaveAttribute("tabindex", "0");
  });

  it("shows the reason when the disabled send takes keyboard focus", async () => {
    renderUnconfigured();

    const wrapper = screen.getByTestId("agent-chat-send-disabled-wrapper");
    act(() => {
      wrapper.focus();
    });
    expect(wrapper).toHaveFocus();

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "The assistant isn't configured on this server",
    );
  });

  it("describes the disabled send with the reason, for screen readers", () => {
    renderUnconfigured();

    expect(
      screen.getByTestId("agent-chat-send-disabled-wrapper"),
    ).toHaveAccessibleDescription(
      "The assistant isn't configured on this server — no model provider has credentials here. Set ANTHROPIC_API_KEY, or AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT and restart the backend. See docs-md/workflows/AGENT_SETUP.md.",
    );
  });

  it("still shows stop while a turn is running, so a stream can be ended", () => {
    threadState.isRunning = true;
    renderUnconfigured();

    const composer = within(screen.getByTestId("agent-chat-composer"));
    expect(composer.getByTestId("agent-chat-stop")).toBeInTheDocument();
  });
});

describe("a failed turn says what went wrong", () => {
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

describe("the panel's request URLs keep each id inside one path segment", () => {
  // The workflow id can come from the page address's ?id=, which a link
  // sets, and the upload step's id from the saved workflow, which anyone who
  // can edit it controls. Encoded, neither can point a request elsewhere.
  const crafted = "../../agent/x?y=1";
  const encoded = "..%2F..%2Fagent%2Fx%3Fy%3D1";

  function attachFile() {
    fireEvent.change(screen.getByTestId("agent-chat-file-input"), {
      target: {
        files: [new File(["%PDF"], "a.pdf", { type: "application/pdf" })],
      },
    });
  }

  it("encodes the upload step's id from the saved workflow", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url === "/api/workflows/wf-1"
        ? new Response(
            JSON.stringify({
              workflow: {
                config: {
                  nodes: {
                    [crafted]: { type: "source", sourceType: "source.upload" },
                  },
                },
              },
            }),
          )
        : new Response("{}"),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderDrawer();

    attachFile();

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/workflows/wf-1/sources/${encoded}/upload`,
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("encodes a workflow id taken from the page address", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    renderDrawer(`/workflows/create?id=${encodeURIComponent(crafted)}`);

    attachFile();

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/workflows/${encoded}`,
        expect.anything(),
      ),
    );
  });

  it("encodes the conversation id when asking the backend to abort", () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetchMock);
    useAgentChatStore.setState({ conversationId: crafted });
    threadState.isRunning = true;
    renderDrawer();

    fireEvent.click(screen.getByTestId("agent-chat-stop"));

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/agent/conversations/${encoded}/abort`,
      expect.objectContaining({ method: "POST" }),
    );
  });
});
