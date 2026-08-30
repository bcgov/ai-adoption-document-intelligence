import { expect, test } from "@playwright/test";
import { dragConnect, edgeCount } from "../helpers/canvas";
import { setupWorkflowBuilderTest } from "../helpers/wb-test";
import {
  buildLinearConfig,
  createWorkflow,
  deleteWorkflow,
} from "../helpers/workflow-api";
import { WorkflowEditorPage } from "../pages/WorkflowEditorPage";

/**
 * Tier 2 — REAL drag-to-connect smoke.
 *
 * This drives the genuine React Flow connection gesture (mouse down on a source
 * handle, move, up on a target handle). It is the flakiest kind of canvas test,
 * so we keep it to a single guard of the gesture itself; breadth lives in
 * tier2-canvas-render via API-built graphs. Retried once on failure.
 */
test.describe("canvas — real drag-to-connect", () => {
  let createdId: string | null = null;

  test.beforeEach(async ({ page }) => {
    await setupWorkflowBuilderTest(page);
  });

  test.afterEach(async ({ request }) => {
    if (createdId) {
      await deleteWorkflow(request, createdId);
      createdId = null;
    }
  });

  test("dragging from a source handle to a target handle adds an edge", async ({
    page,
    request,
  }) => {
    test.info().annotations.push({
      type: "flaky-prone",
      description: "React Flow SVG drag — see tier2-canvas-render for breadth.",
    });
    // Positioned linear chain (prep→submit→store = 2 edges). We add a new
    // forward edge prep→store via a real drag and expect the render to update.
    const created = await createWorkflow(request, {
      name: "e2e drag connect",
      config: buildLinearConfig({ withPositions: true }),
    });
    createdId = created.id;

    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(created.id, 3);
    await expect.poll(() => edgeCount(page)).toBe(2);

    await dragConnect(page, "prep", "store");

    await expect
      .poll(() => edgeCount(page), {
        timeout: 5_000,
        message: "drag did not produce a new edge",
      })
      .toBe(3);
  });
});
