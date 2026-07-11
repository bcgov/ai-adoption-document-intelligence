import { expect, test } from "@playwright/test";
import { setupWorkflowBuilderTest } from "../helpers/wb-test";
import {
  createWorkflow,
  deleteWorkflow,
  type GraphConfig,
} from "../helpers/workflow-api";
import { WorkflowEditorPage } from "../pages/WorkflowEditorPage";

/**
 * Tier 2 — typed I/O artifacts (Manual test plan Part 7).
 *
 * Deterministic, API-built graphs of the typed catalog activities, asserting
 * the RENDER of the canvas typing affordances rather than driving drag. Keys
 * off the stable data-attributes the canvas emits:
 *   - handles: [data-testid="port-tooltip-{input|output}-{nodeId}"] carry
 *     data-port-color / data-port-multi / data-port-array.
 *   - on-selection pill: [data-testid="node-type-pill-row"] with data-shape
 *     ("arrow" | "stacked") and per-badge data-pill-kind / data-pill-direction.
 *
 * Exemplars (from /api/activity-catalog):
 *   - ocr.cleanup   IN[ocrResult:OcrResult]  OUT[cleanedResult:OcrResult]
 *       → exactly one typed port per side → coloured single-port handles,
 *         and a single-port "arrow" pill.
 *   - azureOcr.submit IN[fileData:Document] OUT[apimRequestId,statusCode,
 *       headers : all Artifact] → single-typed input (coloured) but
 *       multi-port output (gray wildcard).
 *   - azureOcr.extract IN[5×Artifact] OUT[ocrResult:OcrResult] → multi-port
 *       side forces the "stacked" pill listing every port.
 */

/** prep → submit → extract → clean linear chain of typed activities. */
function buildTypedChainConfig(name = "e2e typed-io"): GraphConfig {
  const pos = (x: number, y: number) => ({ metadata: { position: { x, y } } });
  return {
    schemaVersion: "1.0",
    metadata: { name },
    entryNodeId: "prep",
    ctx: { blobKey: { type: "string" } },
    nodes: {
      prep: {
        id: "prep",
        type: "activity",
        label: "Prepare",
        activityType: "file.prepare",
        inputs: [{ port: "blobKey", ctxKey: "blobKey" }],
        ...pos(80, 120),
      },
      submit: {
        id: "submit",
        type: "activity",
        label: "Submit OCR",
        activityType: "azureOcr.submit",
        ...pos(400, 120),
      },
      extract: {
        id: "extract",
        type: "activity",
        label: "Extract",
        activityType: "azureOcr.extract",
        ...pos(720, 120),
      },
      clean: {
        id: "clean",
        type: "activity",
        label: "Cleanup",
        activityType: "ocr.cleanup",
        // Second row, central — keeps it clear of both the left-nav overlay
        // and the right viewport edge so selectNode's click lands.
        ...pos(360, 340),
      },
    },
    edges: [
      { id: "e1", source: "prep", target: "submit", type: "normal" },
      { id: "e2", source: "submit", target: "extract", type: "normal" },
      { id: "e3", source: "extract", target: "clean", type: "normal" },
    ],
  };
}

test.describe("typed I/O artifacts", () => {
  let pageErrors: string[] = [];
  let createdId: string | null = null;

  test.beforeEach(async ({ page, request }, testInfo) => {
    pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await setupWorkflowBuilderTest(page);
    const created = await createWorkflow(request, {
      // Unique per test — parallel workers creating the same name collide.
      name: `e2e typed-io ${testInfo.testId}`,
      config: buildTypedChainConfig(),
    });
    createdId = created.id;
  });

  test.afterEach(async ({ request }) => {
    if (createdId) {
      await deleteWorkflow(request, createdId);
      createdId = null;
    }
  });

  test("a single-typed port renders a coloured, non-wildcard handle", async ({
    page,
  }) => {
    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(createdId as string, 4);

    // ocr.cleanup — one typed port each side → coloured, single-port.
    const input = page.getByTestId("port-tooltip-input-clean");
    const output = page.getByTestId("port-tooltip-output-clean");
    await expect(input).toHaveAttribute("data-port-multi", "false");
    await expect(output).toHaveAttribute("data-port-multi", "false");
    // Coloured means NOT the gray wildcard.
    await expect(input).not.toHaveAttribute("data-port-color", "gray");
    await expect(output).not.toHaveAttribute("data-port-color", "gray");
    expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });

  test("a multi-typed port side renders a gray wildcard handle", async ({
    page,
  }) => {
    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(createdId as string, 4);

    // azureOcr.submit output = 3 Artifact ports → multi-port wildcard.
    const output = page.getByTestId("port-tooltip-output-submit");
    await expect(output).toHaveAttribute("data-port-multi", "true");
    await expect(output).toHaveAttribute("data-port-color", "gray");
    // …but its single Document input stays coloured single-port.
    const input = page.getByTestId("port-tooltip-input-submit");
    await expect(input).toHaveAttribute("data-port-multi", "false");
    await expect(input).not.toHaveAttribute("data-port-color", "gray");
  });

  test("handle tooltip carries the kind literal / multi-port prompt", async ({
    page,
  }) => {
    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(createdId as string, 4);

    // The Mantine Tooltip label is mirrored verbatim onto data-port-tooltip;
    // asserting the attribute is faithful to the tooltip text and avoids the
    // flaky hover on React Flow's tiny/overlapped handle dot.
    // Single-typed input → the kind literal.
    await expect(page.getByTestId("port-tooltip-input-clean")).toHaveAttribute(
      "data-port-tooltip",
      "OcrResult",
    );
    // Multi-port output → the "select node" prompt.
    await expect(
      page.getByTestId("port-tooltip-output-submit"),
    ).toHaveAttribute(
      "data-port-tooltip",
      "Multiple outputs — select node to view all",
    );
  });

  test("selecting a single-typed node shows an arrow type pill", async ({
    page,
  }) => {
    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(createdId as string, 4);
    await editor.selectNode("clean");

    const pill = page.getByTestId("node-type-pill-row");
    await expect(pill).toBeVisible();
    await expect(pill).toHaveAttribute("data-shape", "arrow");
    // Both badges carry the OcrResult kind.
    await expect(
      pill.locator('[data-pill-direction="input"][data-pill-kind="OcrResult"]'),
    ).toBeVisible();
    await expect(
      pill.locator(
        '[data-pill-direction="output"][data-pill-kind="OcrResult"]',
      ),
    ).toBeVisible();
  });

  test("selecting a multi-port node shows a stacked pill listing all ports", async ({
    page,
  }) => {
    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(createdId as string, 4);
    await editor.selectNode("extract");

    const pill = page.getByTestId("node-type-pill-row");
    await expect(pill).toBeVisible();
    await expect(pill).toHaveAttribute("data-shape", "stacked");
    // The single typed output (OcrResult) is enumerated…
    await expect(
      pill.locator(
        '[data-pill-direction="output"][data-pill-kind="OcrResult"]',
      ),
    ).toBeVisible();
    // …alongside the Artifact wildcard inputs (all 5 ports are listed).
    await expect(pill.locator('[data-pill-direction="input"]')).toHaveCount(5);
  });
});
