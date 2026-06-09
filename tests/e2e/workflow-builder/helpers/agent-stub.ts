import * as fs from "node:fs";
import * as path from "node:path";
import { Page } from "@playwright/test";

/**
 * Stubs the agent's LLM by route-fulfilling `POST /api/agent/chat` with a
 * pre-recorded Vercel AI SDK UI-message stream, so the chat surface renders
 * deterministically without hitting a real model (no tokens, no flake).
 *
 * The fixtures under ./fixtures/agent were captured verbatim from the live
 * backend (`pipeUIMessageStreamToResponse`), so the framing is exactly what
 * `@assistant-ui/react-ai-sdk`'s runtime expects. The three response headers
 * below are the ones the real endpoint sets and the SDK keys off of —
 * `x-vercel-ai-ui-message-stream: v1` in particular gates stream parsing.
 *
 * NOTE: the agent's tools run SERVER-SIDE, so a stubbed turn renders the
 * streamed text + tool-call chips but does NOT mutate the database. Assert on
 * the chat surface here; assert real graph-building in the @llm tier.
 */
export async function stubAgentChat(
  page: Page,
  fixtureFile: string,
  opts?: { conversationId?: string },
): Promise<void> {
  const body = fs.readFileSync(
    path.join(__dirname, "..", "fixtures", "agent", fixtureFile),
    "utf8",
  );
  const conversationId = opts?.conversationId ?? "e2e-stub-conversation";

  await page.route("**/api/agent/chat", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "x-vercel-ai-ui-message-stream": "v1",
        "x-conversation-id": conversationId,
        "cache-control": "no-cache",
      },
      body,
    });
  });
}

/** A trivial text-only fixture for asserting basic streamed rendering. */
export const SIMPLE_TEXT_FIXTURE = "simple-text.sse.txt";
/** Captured createWorkflow + addNode turn (includes tool-call chips). */
export const CREATE_WORKFLOW_FIXTURE = "create-workflow.sse.txt";
