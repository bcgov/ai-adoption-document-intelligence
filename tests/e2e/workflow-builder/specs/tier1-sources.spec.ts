import { expect, test } from "@playwright/test";
import { setupWorkflowBuilderTest } from "../helpers/wb-test";
import {
  buildSourceConfig,
  createWorkflow,
  deleteWorkflow,
} from "../helpers/workflow-api";
import { WorkflowEditorPage } from "../pages/WorkflowEditorPage";

/**
 * Tier 1 — document source nodes.
 *
 * A `source.upload` node is the workflow's entry. Selecting it opens the source
 * settings panel which surfaces an Upload affordance. The actual upload + run
 * is exercised in the @infra tier (needs a worker); here we assert the source
 * node renders and its settings panel is wired.
 */
test.describe("source nodes", () => {
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

  test("a source.upload node renders and opens its settings panel", async ({
    page,
    request,
  }) => {
    const created = await createWorkflow(request, {
      name: "e2e source workflow",
      config: buildSourceConfig(),
    });
    createdId = created.id;

    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(created.id, 2);

    await editor.selectNode("upload1");
    await expect(page.getByTestId("source-node-settings")).toBeVisible();
    // The Upload & Try affordance is present for a source.upload node.
    await expect(
      page.getByTestId("source-upload-button-section"),
    ).toBeVisible();
  });
});
