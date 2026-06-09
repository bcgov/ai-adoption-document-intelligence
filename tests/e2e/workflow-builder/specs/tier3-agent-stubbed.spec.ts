import { test } from "@playwright/test";
import {
  CREATE_WORKFLOW_FIXTURE,
  SIMPLE_TEXT_FIXTURE,
  stubAgentChat,
} from "../helpers/agent-stub";
import { setupWorkflowBuilderTest } from "../helpers/wb-test";
import { AgentChatPage } from "../pages/AgentChatPage";

/**
 * Tier 3 (default CI) — the AI agent CHAT SURFACE with a stubbed model.
 *
 * The model is replaced by a recorded UI-message stream, so these are fully
 * deterministic and free. They assert what the browser owns: streamed text
 * rendering, tool-call chip rendering, abort/model-picker presence, no page
 * errors. Real graph-building (server-side tools + a live model) lives in the
 * @llm tier.
 */
test.describe("agent chat — stubbed model", () => {
  let pageErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
  });

  test("renders a streamed text response", async ({ page }) => {
    await setupWorkflowBuilderTest(page);
    await stubAgentChat(page, SIMPLE_TEXT_FIXTURE);

    const chat = new AgentChatPage(page);
    await chat.open();
    await chat.sendPrompt("How many activities are in the catalog?");
    await chat.waitForResponseSettled(15_000);
    await chat.expectThreadContains("41 activities");
    test.expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });

  test("renders tool-call chips from a workflow-building turn", async ({
    page,
  }) => {
    await setupWorkflowBuilderTest(page);
    await stubAgentChat(page, CREATE_WORKFLOW_FIXTURE);

    const chat = new AgentChatPage(page);
    await chat.open();
    await chat.sendPrompt(
      'Create a workflow named "demo" with a file.prepare node.',
    );
    await chat.waitForResponseSettled(15_000);

    // The captured turn invokes createWorkflow then addNode — both chips show.
    await test.expect(chat.toolCall("createWorkflow").first()).toBeVisible();
    await test.expect(chat.toolCall("addNode").first()).toBeVisible();
    await chat.expectThreadContains("file.prepare");
    test.expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });

  test("model picker and abort control are present", async ({ page }) => {
    await setupWorkflowBuilderTest(page);
    await stubAgentChat(page, SIMPLE_TEXT_FIXTURE);

    const chat = new AgentChatPage(page);
    await chat.open();
    await test.expect(chat.modelPicker).toBeVisible();
    await test.expect(chat.abort).toBeVisible();
  });
});
