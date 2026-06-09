import { expect, test } from "@playwright/test";
import {
  expectLaidOut,
  readNodeBoxes,
  waitForCanvasReady,
} from "../helpers/canvas";
import {
  SEED_WORKFLOW_IDS,
  setupWorkflowBuilderTest,
} from "../helpers/wb-test";
import {
  buildLinearConfig,
  createWorkflow,
  deleteWorkflow,
} from "../helpers/workflow-api";
import { WorkflowEditorPage } from "../pages/WorkflowEditorPage";

/**
 * Tier 1 — editor load + the auto-layout-on-open regression.
 *
 * Seed workflows (and any API/agent-authored workflow) ship WITHOUT node
 * positions. The fix in WorkflowEditorV2Page hydrates edit-mode through
 * `layoutGraphIfMissingPositions`, so a position-less graph must render as a
 * spread-out layout rather than a stack. These tests guard that fix.
 */
test.describe("workflow editor — load & auto-layout", () => {
  let pageErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await setupWorkflowBuilderTest(page);
  });

  for (const [label, id] of Object.entries(SEED_WORKFLOW_IDS)) {
    test(`seeded workflow "${label}" (no positions) renders laid out`, async ({
      page,
    }) => {
      const editor = new WorkflowEditorPage(page);
      await editor.openExisting(id, 3);
      const boxes = await readNodeBoxes(page);
      expectLaidOut(boxes);
      await editor.expectNoPageErrors(pageErrors);
    });
  }

  test("an API-authored position-less workflow renders laid out on open", async ({
    page,
    request,
  }) => {
    const created = await createWorkflow(request, {
      name: "e2e position-less load",
      config: buildLinearConfig({ withPositions: false }),
    });
    try {
      const editor = new WorkflowEditorPage(page);
      await editor.openExisting(created.id, 3);
      const boxes = await readNodeBoxes(page);
      expect(boxes.length).toBe(3);
      expectLaidOut(boxes);
      await editor.expectNoPageErrors(pageErrors);
    } finally {
      await deleteWorkflow(request, created.id);
    }
  });

  test("a workflow that already has positions is left untouched", async ({
    page,
    request,
  }) => {
    // metadata.position present → auto-layout must be a no-op, preserving the
    // authored coordinates rather than re-running dagre.
    const created = await createWorkflow(request, {
      name: "e2e positioned load",
      config: buildLinearConfig({ withPositions: true }),
    });
    try {
      const editor = new WorkflowEditorPage(page);
      await editor.openExisting(created.id, 3);
      await waitForCanvasReady(page, 3);
      const boxes = await readNodeBoxes(page);
      // Authored x's were 120 / 420 / 720 — distinct columns, left-to-right.
      const xs = boxes.map((b) => b.x).sort((a, b) => a - b);
      expect(xs[0]).toBeLessThan(xs[1]);
      expect(xs[1]).toBeLessThan(xs[2]);
      expectLaidOut(boxes);
      await editor.expectNoPageErrors(pageErrors);
    } finally {
      await deleteWorkflow(request, created.id);
    }
  });
});
