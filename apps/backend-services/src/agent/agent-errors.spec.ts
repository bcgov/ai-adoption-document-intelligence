import {
  AgentBudgetExceededException,
  AgentDemoConversationReadOnlyException,
  type AgentErrorBody,
  AgentProviderNotConfiguredException,
  describeAgentStreamError,
} from "./agent-errors";

// Item 22: a failed agent request has to name its cause. These are the two
// halves of that — the refusals that happen BEFORE the response starts (an
// HTTP body the browser can read a `code` off) and the failures that happen
// mid-stream (a string the AI SDK writes into the stream itself).

describe("agent refusal bodies", () => {
  it("names the provider and the config that is missing, never a value", () => {
    const err = new AgentProviderNotConfiguredException("azure", [
      "AZURE_OPENAI_API_KEY",
      "AZURE_OPENAI_ENDPOINT",
    ]);
    const body = err.getResponse() as AgentErrorBody;

    expect(err.getStatus()).toBe(503);
    expect(body.code).toBe("provider-not-configured");
    expect(body.provider).toBe("azure");
    expect(body.missingConfig).toEqual([
      "AZURE_OPENAI_API_KEY",
      "AZURE_OPENAI_ENDPOINT",
    ]);
    expect(body.message).toContain("Provider 'azure' is not configured");
    expect(body.message).toContain("AZURE_OPENAI_API_KEY");
  });

  it("keeps the budget message a caller can act on", () => {
    const err = new AgentBudgetExceededException(1500, 1000);
    const body = err.getResponse() as AgentErrorBody;
    expect(err.getStatus()).toBe(403);
    expect(body.code).toBe("conversation-budget-exceeded");
    expect(body.message).toContain(
      "Conversation token budget exceeded (1500 / 1000)",
    );
  });

  it("says a demo replay is read-only and what to do instead", () => {
    const err = new AgentDemoConversationReadOnlyException();
    const body = err.getResponse() as AgentErrorBody;
    expect(err.getStatus()).toBe(403);
    expect(body.code).toBe("demo-conversation-read-only");
    expect(body.message).toContain("Start a new conversation");
  });
});

describe("describeAgentStreamError", () => {
  function apiError(statusCode: number, message: string): Error {
    return Object.assign(new Error(message), { statusCode });
  }

  it("calls a 401 what it is: a credential the deployment will not accept", () => {
    const text = describeAgentStreamError(apiError(401, "Access denied"));
    expect(text).toContain("HTTP 401");
    expect(text).toContain("credential is not valid");
    expect(text).toContain("Access denied");
  });

  it("calls a 404 a missing deployment rather than a missing page", () => {
    const text = describeAgentStreamError(
      apiError(404, "DeploymentNotFound: gpt-5.4"),
    );
    expect(text).toContain("deployment or model name does not exist");
    expect(text).toContain("DeploymentNotFound");
  });

  it("names a rate limit and says to retry", () => {
    expect(
      describeAgentStreamError(apiError(429, "Too Many Requests")),
    ).toMatch(/rate-limiting/);
  });

  it("passes an unmapped status through with its message", () => {
    expect(describeAgentStreamError(apiError(500, "upstream exploded"))).toBe(
      "The model provider returned HTTP 500: upstream exploded",
    );
  });

  it("reports a plain error with no status", () => {
    expect(describeAgentStreamError(new Error("no output generated"))).toBe(
      "The agent turn failed: no output generated",
    );
  });

  it("treats an abort as a stop, not a failure", () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(describeAgentStreamError(abort)).toBe(
      "The response was stopped before it finished.",
    );
  });

  it("still says something when the error carries no message at all", () => {
    expect(describeAgentStreamError(new Error(""))).toBe(
      "The agent turn failed before it produced any output.",
    );
  });

  it("truncates a runaway provider message instead of streaming it whole", () => {
    const text = describeAgentStreamError(new Error("x".repeat(5000)));
    expect(text.length).toBeLessThan(500);
    expect(text.endsWith("…")).toBe(true);
  });
});
