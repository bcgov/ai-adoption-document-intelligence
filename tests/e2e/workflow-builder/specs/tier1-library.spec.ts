import { expect, test } from "@playwright/test";
import {
  SEED_WORKFLOW_IDS,
  setupWorkflowBuilderTest,
} from "../helpers/wb-test";
import { deleteWorkflow, getWorkflow } from "../helpers/workflow-api";
import { WorkflowEditorPage } from "../pages/WorkflowEditorPage";

/**
 * Tier 1 — Save as Library.
 *
 * Saving a workflow as a library creates a reusable library lineage that the
 * Child Workflow node's picker can reference. We drive the Save-as-Library modal
 * and confirm the persisted lineage carries `metadata.kind: "library"` (the
 * save-as-library path records library-ness in the config metadata).
 */
test.describe("save as library", () => {
  const libName = "e2e-library-standard";
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

  test("the Save-as-Library modal publishes a library lineage", async ({
    page,
    request,
  }) => {
    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(SEED_WORKFLOW_IDS.standardOcr, 3);

    await editor.openSaveAsLibrary();
    await page.getByTestId("save-as-library-name").fill(libName);

    // Capture the create POST the modal fires — ground truth that the
    // save-as-library flow round-trips through the API.
    const createResponse = page.waitForResponse(
      (r) =>
        r.url().includes("/api/workflows") &&
        r.request().method() === "POST" &&
        r.status() < 300,
    );
    await page.getByTestId("save-as-library-submit").click();
    const res = await createResponse;
    const body = (await res.json()) as
      | { id: string }
      | { workflow: { id: string } };
    createdId = "workflow" in body ? body.workflow.id : body.id;
    expect(createdId).toBeTruthy();

    // The modal closes only on a successful save.
    await expect(page.getByTestId("save-as-library-modal")).toBeHidden({
      timeout: 10_000,
    });

    // The persisted lineage is a library and kept the chosen name.
    const persisted = await getWorkflow(request, createdId as string);
    expect(persisted.name).toBe(libName);
    expect(persisted.config.metadata.kind).toBe("library");
  });
});
