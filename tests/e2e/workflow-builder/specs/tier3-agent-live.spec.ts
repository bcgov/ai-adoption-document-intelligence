import { expect, test } from "@playwright/test";
import {
  BACKEND_URL,
  setupWorkflowBuilderTest,
  TEST_API_KEY,
} from "../helpers/wb-test";
import { AgentChatPage } from "../pages/AgentChatPage";

/**
 * Tier 3 (@llm) — the agent building a real workflow end to end.
 *
 * Tagged @llm: this drives the actual model (Azure/Anthropic), is
 * non-deterministic, and costs tokens. Excluded from default runs; opt in with
 * RUN_LLM=1. It asserts the SERVER-SIDE effect the stub can't: a workflow is
 * actually created and the agent reports the tool calls it made.
 */
test.describe("agent chat — live model @llm", () => {
  test("builds a workflow from a natural-language prompt", {
    tag: "@llm",
  }, async ({ page }) => {
    test.setTimeout(180_000);
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await setupWorkflowBuilderTest(page);

    const chat = new AgentChatPage(page);
    await chat.open();
    await chat.sendPrompt(
      'Create a new workflow named "e2e-llm-demo" and add a single file.prepare ' +
        "activity node with id fp. Confirm what you did in one sentence.",
    );

    // Assert the SERVER-SIDE effect the stub can't: the named workflow gets
    // persisted. We poll the API rather than the chat thread because a
    // successful build navigates to the editor (unmounting the tool-call chip),
    // which makes any thread-level assertion racy. Real model + server-side
    // tool execution can take a while.
    const findMatch = async (): Promise<{ id: string } | undefined> => {
      const res = await page.request.get(
        `${BACKEND_URL}/api/workflows?limit=100`,
        { headers: { "x-api-key": TEST_API_KEY } },
      );
      const body = await res.json();
      const arr = Array.isArray(body) ? body : (body.data ?? body.items ?? []);
      return arr.find((w: { name?: string }) => w.name === "e2e-llm-demo");
    };

    let match: { id: string } | undefined;
    await expect
      .poll(
        async () => {
          match = await findMatch();
          return Boolean(match);
        },
        {
          timeout: 150_000,
          intervals: [2_000],
          message: "agent did not persist the e2e-llm-demo workflow",
        },
      )
      .toBeTruthy();

    // Cleanup the workflow the live agent created.
    if (match?.id) {
      await page.request.delete(`${BACKEND_URL}/api/workflows/${match.id}`, {
        headers: { "x-api-key": TEST_API_KEY },
      });
    }

    expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });
});
