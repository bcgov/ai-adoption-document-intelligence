import { expect, test } from "@playwright/test";
import { setupWorkflowBuilderTest } from "../helpers/wb-test";
import {
  buildSourceConfig,
  createWorkflow,
  deleteWorkflow,
  type GraphConfig,
} from "../helpers/workflow-api";
import { WorkflowEditorPage } from "../pages/WorkflowEditorPage";

/**
 * Tier 2 — Run-drawer UI surface (Manual test plan 11.1, 11.2 + the 13.6
 * upload-mode slice).
 *
 * `tier2-workflow-api` guards the `GET /:id/run-spec` HTTP contract; this spec
 * guards what the *drawer renders from it*: the Trigger URL, the derived input
 * schema (declared `source.api` fields only), the sample curl, and the auth
 * notes — plus the upload-mode contrast, where a `source.upload` workflow
 * (empty input schema) renders the dropzone section instead of the API tabs.
 *
 * Deterministic (no run is started) — default CI tier.
 */

/** A `source.api` workflow declaring one required + one optional field. */
function apiSourceConfig(name: string): GraphConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name },
    entryNodeId: "apiSource",
    ctx: {
      documentUrl: { type: "string" },
      priority: { type: "number" },
    },
    nodes: {
      apiSource: {
        id: "apiSource",
        type: "source",
        sourceType: "source.api",
        label: "API endpoint",
        parameters: {
          fields: [
            // kind DocumentRef so the derived output is assignable to prep's
            // typed DocumentRef input — otherwise creation 400s.
            {
              name: "documentUrl",
              type: "string",
              required: true,
              kind: "DocumentRef",
            },
            { name: "priority", type: "number", required: false },
          ],
        },
        outputs: [{ port: "documentUrl", ctxKey: "documentUrl" }],
        metadata: { position: { x: 120, y: 160 } },
      },
      prep: {
        id: "prep",
        type: "activity",
        label: "Prepare File Data",
        activityType: "file.prepare",
        inputs: [{ port: "blobKey", ctxKey: "documentUrl" }],
        metadata: { position: { x: 460, y: 160 } },
      },
    },
    edges: [
      { id: "src-prep", source: "apiSource", target: "prep", type: "normal" },
    ],
  };
}

test.describe("run drawer UI", () => {
  let pageErrors: string[] = [];
  let createdId: string | null = null;

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

  test("11.1/11.2 — the drawer surfaces trigger URL, declared input schema, sample curl and auth notes", async ({
    page,
    request,
  }, testInfo) => {
    const created = await createWorkflow(request, {
      name: `e2e run-drawer ${testInfo.testId}`,
      config: apiSourceConfig(`e2e run-drawer ${testInfo.testId}`),
    });
    createdId = created.id;

    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(created.id, 2);

    await editor.runButton.click();
    // The Mantine Drawer root testid stays "hidden" to Playwright even when
    // open (same as the history drawer) — wait on the drawer CONTENT instead.
    await page
      .getByTestId("run-drawer-tabs")
      .waitFor({ state: "visible", timeout: 10_000 });

    // "Run this workflow" pre-selects the Run tab (openMode="run"), where
    // the API section lives. Click it anyway to be order-independent.
    await page.getByTestId("run-drawer-tab-run").click();
    const apiSection = page.getByTestId("run-drawer-api-section");
    await expect(apiSection).toBeVisible();

    // Trigger URL — the copyable block carries the real per-workflow URL.
    await expect(apiSection).toContainText(`/api/workflows/${created.id}`);

    // Input schema — exactly the two declared source.api fields, with the
    // required marker on the required one only.
    await expect(apiSection).toContainText("documentUrl");
    await expect(apiSection).toContainText("priority");

    // Sample curl — a runnable POST against the trigger URL.
    await expect(apiSection).toContainText("curl");
    await expect(apiSection).toContainText("POST");

    // Auth notes — the Authentication section renders non-empty guidance.
    await expect(apiSection).toContainText("Authentication");
    await expect(apiSection).toContainText(/api.?key/i);

    expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });

  test("13.6 — an upload-source workflow renders the dropzone section instead of the API tabs", async ({
    page,
    request,
  }, testInfo) => {
    const created = await createWorkflow(request, {
      name: `e2e run-drawer upload ${testInfo.testId}`,
      config: buildSourceConfig(`e2e run-drawer upload ${testInfo.testId}`),
    });
    createdId = created.id;

    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(created.id, 2);

    await editor.runButton.click();
    // Upload-only workflow → empty derived input schema → the drawer shows
    // the upload dropzone and suppresses the Try/Run API tabs entirely.
    // (Wait on content, not the always-hidden Drawer root testid.)
    await page
      .getByTestId("run-drawer-upload-section")
      .waitFor({ state: "visible", timeout: 10_000 });
    await expect(page.getByTestId("run-drawer-upload-dropzone")).toBeVisible();
    await expect(page.getByTestId("run-drawer-tabs")).toHaveCount(0);

    expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });
});
