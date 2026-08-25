import { describe, expect, it } from "vitest";
import {
  parseAgentChatDeepLink,
  storedMessagesToUIMessages,
} from "./conversation-replay";
import type { AgentConversationMessage } from "./useAgentConversations";

describe("parseAgentChatDeepLink", () => {
  it("returns the conversation id from the agentChat query param", () => {
    expect(parseAgentChatDeepLink("?agentChat=conv-1")).toBe("conv-1");
  });

  it("returns the id when other params are present", () => {
    expect(parseAgentChatDeepLink("?foo=bar&agentChat=conv-2&x=1")).toBe(
      "conv-2",
    );
  });

  it("returns null when the param is absent", () => {
    expect(parseAgentChatDeepLink("?foo=bar")).toBeNull();
    expect(parseAgentChatDeepLink("")).toBeNull();
  });

  it("returns null when the param is empty", () => {
    expect(parseAgentChatDeepLink("?agentChat=")).toBeNull();
  });
});

function row(
  over: Partial<AgentConversationMessage> &
    Pick<AgentConversationMessage, "content">,
): AgentConversationMessage {
  return {
    id: "m1",
    conversationId: "c1",
    role: "user",
    inputTokens: null,
    outputTokens: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    ...over,
  };
}

describe("storedMessagesToUIMessages", () => {
  it("passes through a stored user message that already has parts", () => {
    const out = storedMessagesToUIMessages([
      row({
        id: "u1",
        role: "user",
        content: { role: "user", parts: [{ type: "text", text: "hi there" }] },
      }),
    ]);
    expect(out).toEqual([
      { id: "u1", role: "user", parts: [{ type: "text", text: "hi there" }] },
    ]);
  });

  it("rebuilds an assistant message with text + dynamic-tool parts", () => {
    const out = storedMessagesToUIMessages([
      row({
        id: "a1",
        role: "assistant",
        content: {
          finishReason: "stop",
          usage: { inputTokens: 10, outputTokens: 5 },
          parts: [
            {
              type: "dynamic-tool",
              toolName: "addNode",
              toolCallId: "tc1",
              state: "output-available",
              input: { node: { id: "n1" } },
              output: { ok: true },
            },
            { type: "text", text: "All set." },
          ],
        },
      }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("a1");
    expect(out[0].role).toBe("assistant");
    expect(out[0].parts).toEqual([
      {
        type: "dynamic-tool",
        toolName: "addNode",
        toolCallId: "tc1",
        state: "output-available",
        input: { node: { id: "n1" } },
        output: { ok: true },
      },
      { type: "text", text: "All set." },
    ]);
  });

  it("projects a legacy { text } assistant envelope into a single text part", () => {
    const out = storedMessagesToUIMessages([
      row({ id: "a2", role: "assistant", content: { text: "legacy reply" } }),
    ]);
    expect(out).toEqual([
      {
        id: "a2",
        role: "assistant",
        parts: [{ type: "text", text: "legacy reply" }],
      },
    ]);
  });

  it("drops rows whose content is null, non-object, or shapeless", () => {
    const out = storedMessagesToUIMessages([
      row({ id: "x1", content: null as unknown as object }),
      row({ id: "x2", content: "a string" as unknown as object }),
      row({ id: "x3", content: { finishReason: "stop" } }),
    ]);
    expect(out).toEqual([]);
  });

  it("drops rows with an unsupported role", () => {
    const out = storedMessagesToUIMessages([
      row({
        id: "s1",
        role: "system" as AgentConversationMessage["role"],
        content: { parts: [{ type: "text", text: "sys" }] },
      }),
    ]);
    expect(out).toEqual([]);
  });

  it("preserves order across the conversation", () => {
    const out = storedMessagesToUIMessages([
      row({
        id: "u1",
        role: "user",
        content: { parts: [{ type: "text", text: "q" }] },
      }),
      row({
        id: "a1",
        role: "assistant",
        content: { parts: [{ type: "text", text: "a" }] },
      }),
      row({
        id: "u2",
        role: "user",
        content: { parts: [{ type: "text", text: "q2" }] },
      }),
    ]);
    expect(out.map((m) => m.id)).toEqual(["u1", "a1", "u2"]);
  });
});
