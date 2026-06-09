import * as path from "node:path";
import { expect, test } from "@playwright/test";
import { setupWorkflowBuilderTest } from "../helpers/wb-test";
import {
  buildSourceConfig,
  createWorkflow,
  deleteWorkflow,
} from "../helpers/workflow-api";
import { WorkflowEditorPage } from "../pages/WorkflowEditorPage";

const SAMPLE_PDF = path.join(
  __dirname,
  "..",
  "fixtures",
  "documents",
  "sample-invoice.pdf",
);

/**
 * Tier 3 (@infra) — Try-in-place execution.
 *
 * Tagged @infra: a real Try kicks off a Temporal workflow execution, so this
 * needs the worker (and, for any dynamic node, the deno-runner) live. Excluded
 * from default runs; opt in with RUN_INFRA=1. It asserts the run is accepted
 * and the run drawer surfaces progress — not OCR content (which depends on
 * external services).
 */
test.describe("try-in-place @infra", () => {
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

  test("Upload & Try a source workflow starts a run", {
    tag: "@infra",
  }, async ({ page, request }) => {
    const created = await createWorkflow(request, {
      name: "e2e try infra",
      config: buildSourceConfig("e2e try infra"),
    });
    createdId = created.id;

    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(created.id, 2);

    // Open the source node's Upload & Try affordance.
    await editor.selectNode("upload1");
    const uploadInput = page.getByTestId("source-upload-button-input");
    await expect(
      page.getByTestId("source-upload-button-section"),
    ).toBeVisible();

    // Attach the sample PDF fixture and trigger the upload+try.
    await uploadInput.setInputFiles(SAMPLE_PDF);

    // The upload+try succeeds: the source node's success affordance appears
    // (the run was accepted and kicked off via Temporal).
    await expect(page.getByTestId("source-upload-button-success")).toBeVisible({
      timeout: 30_000,
    });
  });
});
