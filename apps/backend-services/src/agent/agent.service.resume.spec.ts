import { convertToModelMessages } from "ai";
import { storedRowToUIMessage } from "./agent.service";

// ITEM 23 — a persisted assistant turn that carried tool calls must
// round-trip through storedRowToUIMessage with its tool parts intact, so
// resume preserves the agent's tool-call/tool-result history instead of
// collapsing it to a single text part.
describe("storedRowToUIMessage — tool-part round-trip (ITEM 23)", () => {
  it("rehydrates a persisted assistant turn with its dynamic-tool parts", () => {
    const storedRow = {
      id: "msg-1",
      role: "assistant",
      content: {
        parts: [
          {
            type: "dynamic-tool",
            toolName: "addNode",
            toolCallId: "tc1",
            state: "output-available",
            input: { node: { id: "n1" } },
            output: { ok: true },
          },
          { type: "text", text: "Added the node." },
        ],
        finishReason: "stop",
        usage: { inputTokens: 50, outputTokens: 20 },
      },
    };

    const ui = storedRowToUIMessage(storedRow);
    expect(ui).not.toBeNull();
    expect(ui?.role).toBe("assistant");
    // Tool part survives — NOT collapsed into a single text part.
    expect(ui?.parts).toHaveLength(2);
    const toolPart = ui?.parts[0] as {
      type: string;
      toolName: string;
      state: string;
      output: unknown;
    };
    expect(toolPart.type).toBe("dynamic-tool");
    expect(toolPart.toolName).toBe("addNode");
    expect(toolPart.state).toBe("output-available");
    expect(toolPart.output).toEqual({ ok: true });
  });

  it("the rehydrated message converts back to model messages with the tool call", async () => {
    const storedRow = {
      id: "msg-1",
      role: "assistant",
      content: {
        parts: [
          {
            type: "dynamic-tool",
            toolName: "addNode",
            toolCallId: "tc1",
            state: "output-available",
            input: { node: { id: "n1" } },
            output: { ok: true },
          },
          { type: "text", text: "Added the node." },
        ],
      },
    };
    const ui = storedRowToUIMessage(storedRow);
    expect(ui).not.toBeNull();

    // convertToModelMessages is what startChat feeds the model on resume.
    // It must not throw and must surface the tool call + result.
    const modelMessages = await convertToModelMessages(ui === null ? [] : [ui]);
    const serialised = JSON.stringify(modelMessages);
    expect(serialised).toContain("tool-call");
    expect(serialised).toContain("addNode");
    expect(serialised).toContain("tool-result");
  });

  it("still accepts the legacy single-text envelope", () => {
    const ui = storedRowToUIMessage({
      id: "msg-legacy",
      role: "assistant",
      content: { text: "plain reply", finishReason: "stop" },
    });
    expect(ui?.parts).toEqual([{ type: "text", text: "plain reply" }]);
  });

  it("returns null for unrecognised content", () => {
    expect(
      storedRowToUIMessage({ id: "x", role: "assistant", content: null }),
    ).toBeNull();
  });
});
