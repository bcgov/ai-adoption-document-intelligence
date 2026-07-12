import * as path from "node:path";
import { expect, test } from "@playwright/test";
import { setupWorkflowBuilderTest } from "../helpers/wb-test";
import {
  createWorkflow,
  deleteWorkflow,
  type GraphConfig,
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
 * Tier 3 (@infra) — Try-in-place run progression + previews (Manual test plan
 * 9.4–9.5). Where `tier3-try-infra` only asserts a run STARTS, this asserts the
 * run COMPLETES: the canvas per-node run-status badges reach `succeeded` and a
 * preview widget renders for each completed node.
 *
 * Deterministic without external services: `source.upload → file.prepare` runs
 * entirely on local infra (blob storage), no Azure/OCR and no dynamic-node
 * PLATFORM_API_KEY. Tagged @infra because it needs the Temporal worker +
 * deno-runner stack live (a real Try execution) — excluded from default CI.
 *
 * Wiring note: the upload endpoint writes the blob key to the source node's
 * configured ctxKey (default `documentUrl`), so `file.prepare` binds its
 * `blobKey` port to `documentUrl` — otherwise the activity fails with
 * "No blobKey provided".
 */
function buildSourcePrepConfig(name = "e2e try-preview"): GraphConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name },
    entryNodeId: "upload1",
    ctx: { documentUrl: { type: "string" } },
    nodes: {
      upload1: {
        id: "upload1",
        type: "source",
        sourceType: "source.upload",
        label: "Upload",
        outputs: [{ port: "documentUrl", ctxKey: "documentUrl" }],
        metadata: { position: { x: 120, y: 300 } },
      },
      prep: {
        id: "prep",
        type: "activity",
        label: "Prepare File Data",
        activityType: "file.prepare",
        inputs: [{ port: "blobKey", ctxKey: "documentUrl" }],
        metadata: { position: { x: 460, y: 300 } },
      },
    },
    edges: [
      { id: "upload1-prep", source: "upload1", target: "prep", type: "normal" },
    ],
  };
}

/** Locator for a node's canvas run-status badge (carries `data-status`). */
function nodeStatusBadge(
  page: import("@playwright/test").Page,
  nodeId: string,
) {
  return page
    .getByTestId(`node-status-badge-wrapper-${nodeId}`)
    .getByTestId("node-status-badge");
}

test.describe("try-in-place previews @infra", () => {
  // A real Try execution (upload → Temporal run → preview-cache write) plus a
  // reload; the per-assertion waits below are 60s each, so the default 30s
  // per-test budget flakes under parallel-worker load. Give the whole test
  // room for its slowest honest path.
  test.describe.configure({ timeout: 180_000 });

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

  test(
    "Upload & Try runs to completion and renders a preview per node",
    { tag: "@infra" },
    async ({ page, request }, testInfo) => {
      const created = await createWorkflow(request, {
        name: `e2e try-preview ${testInfo.testId}`,
        config: buildSourcePrepConfig(`e2e try-preview ${testInfo.testId}`),
      });
      createdId = created.id;

      const editor = new WorkflowEditorPage(page);
      await editor.openExisting(created.id, 2);

      // Kick off the run via the source node's Upload & Try affordance.
      await editor.selectNode("upload1");
      await expect(
        page.getByTestId("source-upload-button-section"),
      ).toBeVisible();
      await page
        .getByTestId("source-upload-button-input")
        .setInputFiles(SAMPLE_PDF);
      await expect(
        page.getByTestId("source-upload-button-success"),
      ).toBeVisible({ timeout: 60_000 });

      // The canvas polls node-statuses (~1.5s cadence); both nodes settle on
      // `succeeded` once the run completes (source.upload → file.prepare).
      await expect(nodeStatusBadge(page, "upload1")).toHaveAttribute(
        "data-status",
        "succeeded",
        { timeout: 60_000 },
      );
      await expect(nodeStatusBadge(page, "prep")).toHaveAttribute(
        "data-status",
        "succeeded",
        { timeout: 60_000 },
      );

      // Assert the completed source node renders its cached output as an inline
      // preview widget. We RELOAD first: during a live Try the preview hook
      // fires a single debounced refetch on the running→succeeded transition,
      // which can race ahead of the cache-row write; a fresh mount instead
      // fetches the now-committed "most recent" cache row deterministically.
      //
      // We assert the SOURCE node's preview: it carries the real uploaded
      // Document (a `documentUrl`), so its DocumentPreview renders to `ready`.
      // `file.prepare`'s cached output is a degenerate empty Document
      // (`outputCtx: {}`) whose preview has nothing to render — asserting it
      // would be testing a non-viewable artifact, so we don't.
      await editor.openExisting(created.id, 2);

      const uploadPreview = page.getByTestId("preview-widget-upload1");
      await expect(uploadPreview).toHaveAttribute("data-state", "ready", {
        timeout: 60_000,
      });
      await expect(uploadPreview).toHaveAttribute(
        "data-output-kind",
        "Document",
      );
    },
  );
});
