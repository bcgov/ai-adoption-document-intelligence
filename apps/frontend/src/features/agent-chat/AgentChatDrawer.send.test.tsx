/**
 * What the drawer's composer sends, with assistant-ui's real composer and
 * runtime: pressing Enter in the message box submits the composer's form
 * itself (`requestSubmit()`), without going through the send button, so a
 * disabled send button alone does not stop a message going out.
 *
 * Only the network edge is stubbed: `fetch`, which the drawer's chat
 * transport calls for `POST /api/agent/chat`, and the hooks that load the
 * model list, the group and past conversations.
 */

import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentChatDrawer } from "./AgentChatDrawer";
import { useAgentChatStore } from "./store";
import type { AgentModelsResult } from "./useAgentModels";

// jsdom has no layout and implements no scrolling; the thread viewport
// scrolls itself to the newest message whenever the thread changes.
Element.prototype.scrollTo = () => undefined;

vi.mock("../../auth/GroupContext", () => ({
  useGroup: () => ({ activeGroup: { id: "group-1" } }),
}));

vi.mock("./useAgentConversations", () => ({
  useAgentConversations: () => ({ data: [], isFetching: false }),
  getAgentAuthHeaders: () => ({}),
  fetchAgentConversation: vi.fn(),
}));

/** Stands in for `GET /api/agent/models`; each test sets what it returns. */
const modelsResponse = vi.hoisted(() => ({
  current: undefined as AgentModelsResult | undefined,
}));

vi.mock("./useAgentModels", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./useAgentModels")>()),
  useAgentModels: () => ({
    data: modelsResponse.current,
    isPending: false,
    isError: false,
  }),
}));

/** What a backend with an Azure deployment configured reports. */
const CONFIGURED: AgentModelsResult = {
  items: [
    {
      label: "Azure OpenAI — gpt-4o",
      name: "gpt-4o",
      tier: "Balanced",
      provider: "azure",
      model: "gpt-4o",
      isDefault: true,
    },
  ],
  missingConfig: [{ provider: "anthropic", variables: ["ANTHROPIC_API_KEY"] }],
};

/** What a backend with no model provider reports (`listModels`). */
const UNCONFIGURED: AgentModelsResult = {
  items: [],
  missingConfig: [
    { provider: "anthropic", variables: ["ANTHROPIC_API_KEY"] },
    {
      provider: "azure",
      variables: ["AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT"],
    },
  ],
};

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
  requestUrl(input).endsWith("/api/agent/chat")
    ? new Response(
        JSON.stringify({
          statusCode: 503,
          code: "provider-not-configured",
          message: "Provider 'azure' is not configured on this backend.",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      )
    : new Response("{}", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
);

function chatRequests() {
  return fetchMock.mock.calls.filter(([input]) =>
    requestUrl(input).endsWith("/api/agent/chat"),
  );
}

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
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  useAgentChatStore.setState({
    isOpen: true,
    conversationId: null,
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

describe("the composer's Enter key", () => {
  it("sends the message when the server has a model", async () => {
    modelsResponse.current = CONFIGURED;
    renderDrawer();

    const user = userEvent.setup();
    await user.type(screen.getByTestId("agent-chat-textarea"), "hello{Enter}");

    await waitFor(() => expect(chatRequests()).toHaveLength(1));
  });

  it("sends nothing while the server has no model, and keeps the text", async () => {
    modelsResponse.current = UNCONFIGURED;
    renderDrawer();

    const textarea = screen.getByTestId("agent-chat-textarea");
    const user = userEvent.setup();
    await user.type(textarea, "hello{Enter}");
    // Longer than the configured case above takes to reach the network.
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(chatRequests()).toHaveLength(0);
    expect(textarea).toHaveValue("hello");
  });
});
