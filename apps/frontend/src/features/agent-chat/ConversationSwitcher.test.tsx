/**
 * Item 24 — "Show past conversations" was empty on the seeded demo, because
 * a seeded transcript was visible only to the identity that ran the seed.
 * The backend now returns it to everyone in the group, flagged `isDemo`.
 * This covers the UI half of that: a demo row says what it is, and does not
 * offer a delete control for shared demo data.
 */

import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConversationSwitcher } from "./ConversationSwitcher";
import type { AgentConversationListItem } from "./useAgentConversations";

const conversations = vi.hoisted(() => ({
  current: [] as AgentConversationListItem[],
}));

vi.mock("./useAgentConversations", () => ({
  useAgentConversations: () => ({
    data: conversations.current,
    isFetching: false,
  }),
  getAgentAuthHeaders: () => ({}),
}));

function item(
  overrides: Partial<AgentConversationListItem>,
): AgentConversationListItem {
  return {
    id: "conv-1",
    workflowId: "wf-1",
    groupId: "g1",
    createdBy: "actor-1",
    provider: "azure",
    model: "gpt-5.4",
    title: "My chat",
    isDemo: false,
    createdAt: "2026-08-06T10:00:00.000Z",
    lastMessageAt: "2026-08-06T10:05:00.000Z",
    ...overrides,
  };
}

function renderSwitcher(items: AgentConversationListItem[]) {
  conversations.current = items;
  return render(
    <MantineProvider>
      <QueryClientProvider client={new QueryClient()}>
        <ConversationSwitcher
          open
          workflowId="wf-1"
          activeConversationId={null}
          activeGroupId="g1"
          onSelect={vi.fn()}
        />
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe("ConversationSwitcher — seeded demo rows", () => {
  it("labels a seeded demo so an empty-looking list is explained", () => {
    renderSwitcher([
      item({
        id: "demo-agent-ocr-pipeline",
        title: "Invoice OCR pipeline",
        isDemo: true,
      }),
    ]);

    expect(
      screen.getByTestId("agent-chat-conversation-demo-agent-ocr-pipeline"),
    ).toHaveTextContent("Invoice OCR pipeline");
    expect(
      screen.getByTestId(
        "agent-chat-conversation-demo-agent-ocr-pipeline-demo-badge",
      ),
    ).toHaveTextContent("demo replay");
  });

  it("withholds delete on a demo — it is the group's, not the reader's", () => {
    renderSwitcher([item({ id: "demo-agent-ocr-pipeline", isDemo: true })]);
    expect(
      screen.queryByTestId(
        "agent-chat-conversation-demo-agent-ocr-pipeline-delete",
      ),
    ).toBeNull();
  });

  it("keeps delete on the reader's own conversations", () => {
    renderSwitcher([item({ id: "conv-1", isDemo: false })]);
    expect(
      screen.getByTestId("agent-chat-conversation-conv-1-delete"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("agent-chat-conversation-conv-1-demo-badge"),
    ).toBeNull();
  });

  it("lists a demo alongside the reader's own conversations", () => {
    renderSwitcher([
      item({ id: "demo-agent-ocr-pipeline", isDemo: true }),
      item({ id: "conv-1", isDemo: false }),
    ]);
    expect(screen.getByText(/Past conversations \(2\)/)).toBeInTheDocument();
  });
});
