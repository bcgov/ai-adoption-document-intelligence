/**
 * Item 22 — a failed agent request must name its cause in the
 * conversation. These cover the exact shapes that reach the drawer: the
 * backend's structured refusal, a plain Nest exception body, the sentence
 * the backend writes into a broken stream, and the junk cases in between.
 */

import { describe, expect, it } from "vitest";
import { describeAgentChatError } from "./agent-error";

describe("describeAgentChatError", () => {
  it("names an unconfigured provider from the structured refusal body", () => {
    const body = JSON.stringify({
      statusCode: 503,
      code: "provider-not-configured",
      provider: "azure",
      missingConfig: ["AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT"],
      message:
        "Provider 'azure' is not configured on this backend. Set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT, or pick a model from a provider that is configured.",
    });

    const described = describeAgentChatError(new Error(body));

    expect(described.code).toBe("provider-not-configured");
    expect(described.title).toBe("That model is not configured on this server");
    expect(described.detail).toContain("Provider 'azure' is not configured");
  });

  it("names a spent conversation budget", () => {
    const described = describeAgentChatError(
      new Error(
        JSON.stringify({
          statusCode: 403,
          code: "conversation-budget-exceeded",
          message: "Conversation token budget exceeded (1500 / 1000).",
        }),
      ),
    );
    expect(described.title).toBe("This conversation has spent its budget");
    expect(described.detail).toContain("1500 / 1000");
  });

  it("names a demo replay as read-only", () => {
    const described = describeAgentChatError(
      new Error(
        JSON.stringify({
          statusCode: 403,
          code: "demo-conversation-read-only",
          message: "This is a seeded demo conversation — a read-only replay.",
        }),
      ),
    );
    expect(described.title).toBe("This is a read-only demo replay");
  });

  it("still shows the message from an ordinary Nest exception body", () => {
    const described = describeAgentChatError(
      new Error(
        JSON.stringify({
          statusCode: 404,
          message: "Conversation not found",
          error: "Not Found",
        }),
      ),
    );
    expect(described.code).toBeNull();
    expect(described.detail).toBe("Conversation not found");
  });

  it("folds class-validator's array of messages into one sentence", () => {
    const described = describeAgentChatError(
      new Error(
        JSON.stringify({
          statusCode: 400,
          message: ["messages must be an array", "model must be a string"],
        }),
      ),
    );
    expect(described.detail).toBe(
      "messages must be an array model must be a string",
    );
  });

  it("falls back to the status when a JSON body carries no message", () => {
    const described = describeAgentChatError(
      new Error(JSON.stringify({ statusCode: 500 })),
    );
    expect(described.detail).toBe("The server refused the request (HTTP 500).");
  });

  it("passes a mid-stream sentence through untouched", () => {
    // This is what the backend's `describeAgentStreamError` writes into the
    // stream once the response headers are already sent.
    const sentence =
      "The model provider rejected the request (HTTP 401): the configured credential is not valid for this deployment.";
    const described = describeAgentChatError(new Error(sentence));
    expect(described.detail).toBe(sentence);
    expect(described.code).toBeNull();
  });

  it("does not spill an HTML error page into the conversation", () => {
    const described = describeAgentChatError(
      new Error("<!doctype html><html><body>502 Bad Gateway</body></html>"),
    );
    expect(described.detail).toContain("unexpected non-JSON response");
    expect(described.detail).not.toContain("<html>");
  });

  it("says something specific even for an empty error", () => {
    const described = describeAgentChatError(new Error(""));
    expect(described.title).toBe("The agent could not complete this request");
    expect(described.detail.length).toBeGreaterThan(0);
  });

  it("handles a thrown non-Error", () => {
    expect(describeAgentChatError("network down").detail).toBe("network down");
  });
});
