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

  test("attaching a file renders an attachment chip (queued until a workflow exists)", async ({
    page,
  }) => {
    // Opened from the app root (no workflow loaded) → currentWorkflowId is
    // null, so the composer QUEUES the file client-side and renders a chip
    // instead of firing an upload. Fully deterministic — no backend call.
    await setupWorkflowBuilderTest(page);

    const chat = new AgentChatPage(page);
    await chat.open();
    await chat.attachFile({
      name: "invoice.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 stub"),
    });

    await test.expect(chat.attachment).toBeVisible();
    await test.expect(chat.attachment).toContainText("invoice.pdf");
    test.expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });

  test("the conversation switcher lists prior conversations and selecting one marks it active", async ({
    page,
  }) => {
    await setupWorkflowBuilderTest(page);
    // Stub the history list (registered after setup's broad `**​/api/**`
    // handler, so it wins). A URL predicate matches ONLY the list path — the
    // detail / delete / abort sub-paths fall through to the real backend
    // (none are triggered here).
    await page.route(
      (url) => url.pathname === "/api/agent/conversations",
      async (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            items: [
              {
                id: "conv-e2e-1",
                workflowId: null,
                groupId: "seeddefaultgroup",
                createdBy: "test-user",
                provider: "anthropic",
                model: "claude-haiku-4-5-20251001",
                title: "Prior planning chat",
                createdAt: "2026-07-01T00:00:00.000Z",
                lastMessageAt: "2026-07-01T00:05:00.000Z",
              },
            ],
          }),
        }),
    );

    const chat = new AgentChatPage(page);
    await chat.open();

    // Expand the (collapsed-by-default) switcher and see the prior chat.
    await chat.conversationSwitcherToggle.click();
    const item = chat.conversation("conv-e2e-1");
    await test.expect(item).toBeVisible();
    await test.expect(item).toContainText("Prior planning chat");

    // Selecting it marks it active (violet left border — #7950f2).
    await item.click();
    await test.expect(item).toHaveCSS("border-left-color", "rgb(121, 80, 242)");
    test.expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });
});
