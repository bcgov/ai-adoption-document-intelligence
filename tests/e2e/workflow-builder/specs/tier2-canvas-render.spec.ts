import { expect, test } from "@playwright/test";
import {
  edgeCount,
  readNodeBoxes,
  rfNode,
  waitForCanvasReady,
} from "../helpers/canvas";
import { setupWorkflowBuilderTest } from "../helpers/wb-test";
import {
  buildLinearConfig,
  createWorkflow,
  deleteWorkflow,
} from "../helpers/workflow-api";
import { WorkflowEditorPage } from "../pages/WorkflowEditorPage";

/**
 * Tier 2 — canvas render fidelity for an API-built graph.
 *
 * We build the workflow via the backend (deterministic, no drag flake) and
 * assert the editor renders every node + edge. This is the breadth strategy;
 * the genuine drag gesture is smoke-tested separately in tier2-canvas-drag.
 */
test.describe("canvas — renders an API-built graph", () => {
  let createdId: string | null = null;
  let pageErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await setupWorkflowBuilderTest(page);
  });

  test.afterEach(async ({ request }) => {
    if (createdId) {
      await deleteWorkflow(request, createdId);
      createdId = null;
    }
  });

  test("every node and edge from the config is rendered", async ({
    page,
    request,
  }) => {
    const created = await createWorkflow(request, {
      name: "e2e canvas render",
      config: buildLinearConfig({ withPositions: true }),
    });
    createdId = created.id;

    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(created.id, 3);

    const boxes = await readNodeBoxes(page);
    expect(boxes.map((b) => b.id).sort()).toEqual(["prep", "store", "submit"]);

    // Two edges: prep→submit, submit→store.
    await expect.poll(() => edgeCount(page)).toBe(2);

    // Each node body is visible.
    await expect(rfNode(page, "prep")).toBeVisible();
    await expect(rfNode(page, "submit")).toBeVisible();
    await expect(rfNode(page, "store")).toBeVisible();

    expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });

  test("the multi-page report seed renders its full graph", async ({
    page,
  }) => {
    // 16-node graph with map/join/switch — a denser render smoke.
    const editor = new WorkflowEditorPage(page);
    await editor.openExisting("seed-workflow-multi-page-report", 10);
    await waitForCanvasReady(page, 10);
    const boxes = await readNodeBoxes(page);
    expect(boxes.length).toBeGreaterThanOrEqual(10);
    expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });
});
