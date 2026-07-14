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
 * the per-port canvas contract (PORT_WIRING_DESIGN.md) rather than driving
 * drag. Keys off the stable data-attributes the canvas emits:
 *
 *   - port rows: [data-testid="port-row-<nodeId>-<in|out>-<port>"] carry
 *     data-port-kind, data-needs-source ("required && unbound") and
 *     data-from-ctx (binding reads a declared workflow variable). Row text
 *     is the catalog's plain-language `label`.
 *   - wires: each edge's inner <g> carries data-wire-variant
 *     ("data" | "sequence" | "conditional" | "error") and, on data wires,
 *     data-provenance ("pinned" | "auto:<via>" | "auto" | "manual") plus a
 *     native SVG <title> with the plain-language provenance. Data wires get
 *     the `wb-data-wire` class whose CSS re-enables pointer events so the
 *     tooltip is hoverable.
 *
 * The old single-handle affordances (port-tooltip-{input|output}-<nodeId>,
 * node-type-pill-row) are GONE from activity nodes and must not resurface.
 *
 * Fixture (exemplars from the static catalog):
 *   prep(file.prepare) → submit(azureOcr.submit) → extract(azureOcr.extract)
 *   → clean(ocr.cleanup), plus prep → orphan(ocr.cleanup) which has no
 *   bindable port pair (prep produces no OcrResult) → sequence wire.
 *
 * On load the editor materialises auto-bindings (resolveBindings), so edges
 * alone yield:
 *   - wire:submit:fileData      prep.preparedData → submit.fileData
 *                               (Document kind match → auto:nearest-kind)
 *   - wire:extract:apimRequestId submit.apimRequestId → extract.apimRequestId
 *                               (Artifact identifier port → auto:name-match)
 *
 * KNOWN QUIRK (not asserted): extract.ocrResult → clean.ocrResult auto-binds
 * clean's input, but whether the wire RENDERS depends on backend node-key
 * order — resolveBindings' consumer loop iterates a snapshot and its
 * write-back can clobber a producer output binding materialised earlier in
 * the same pass (packages/graph-workflow/src/auto-wire/resolver.ts), so with
 * the order the backend currently persists, e3 renders as a sequence wire
 * with clean's row still bound. Total wire counts and e3's variant are
 * therefore deliberately NOT asserted; the two wires above are order-stable.
 *
 * Node positions are staggered vertically on purpose: a perfectly
 * horizontal/vertical straight wire has a zero-height/width bounding box,
 * which Playwright treats as hidden — the hover regression test needs a
 * diagonal wire.
 */

const pos = (x: number, y: number) => ({ metadata: { position: { x, y } } });

/** prep → submit → extract → clean chain + a bindless prep → orphan hop. */
function buildTypedChainConfig(name = "e2e typed-io"): GraphConfig {
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
        ...pos(560, 320),
      },
      extract: {
        id: "extract",
        type: "activity",
        label: "Extract",
        activityType: "azureOcr.extract",
        ...pos(1040, 120),
      },
      clean: {
        id: "clean",
        type: "activity",
        label: "Cleanup",
        activityType: "ocr.cleanup",
        ...pos(1200, 560),
      },
      orphan: {
        id: "orphan",
        type: "activity",
        label: "Orphan Cleanup",
        activityType: "ocr.cleanup",
        ...pos(160, 560),
      },
    },
    edges: [
      { id: "e1", source: "prep", target: "submit", type: "normal" },
      { id: "e2", source: "submit", target: "extract", type: "normal" },
      { id: "e3", source: "extract", target: "clean", type: "normal" },
      { id: "e4", source: "prep", target: "orphan", type: "normal" },
    ],
  };
}

/** Inner wire <g> (variant/provenance/<title> carrier) of an edge. */
function wireGroup(page: import("@playwright/test").Page, edgeId: string) {
  return page.locator(
    `.react-flow__edge[data-id="${edgeId}"] g[data-wire-variant]`,
  );
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

  test("activity cards render one labelled, kind-stamped row per catalog port", async ({
    page,
  }) => {
    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(createdId as string, 5);

    // ocr.cleanup's single typed input row, stamped with its kind literal.
    const cleanIn = page.getByTestId("port-row-clean-in-ocrResult");
    await expect(cleanIn).toBeVisible();
    await expect(cleanIn).toHaveAttribute("data-port-kind", "OcrResult");

    // azureOcr.extract declares 5 catalog inputs → 5 input rows.
    await expect(
      page.locator('[data-testid^="port-row-extract-in-"]'),
    ).toHaveCount(5);

    // Rows show the plain-language catalog label, not the raw port name.
    await expect(page.getByTestId("port-row-submit-in-fileData")).toHaveText(
      "Prepared file data",
    );

    // A binding to a declared workflow variable surfaces as data-from-ctx.
    await expect(page.getByTestId("port-row-prep-in-blobKey")).toHaveAttribute(
      "data-from-ctx",
      "blobKey",
    );

    // The retired single-handle affordances must not resurface on activity
    // nodes: no per-node handle tooltips, no on-selection type pill.
    // (submit, not clean — clean's painted position sits under the
    // right-hand settings rail at this fitView zoom, where clicks land on
    // the rail instead of the canvas.)
    await expect(
      page.locator('[data-testid^="port-tooltip-"]'),
    ).toHaveCount(0);
    await editor.selectNode("submit");
    await expect(page.getByTestId("node-type-pill-row")).toHaveCount(0);

    expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });

  test("auto-wired bindings render as provenance-stamped data wires", async ({
    page,
  }) => {
    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(createdId as string, 5);

    // Kind-based auto-wire: prep.preparedData (Document) → submit.fileData.
    const fileWire = wireGroup(page, "wire:submit:fileData");
    await expect(fileWire).toHaveAttribute("data-wire-variant", "data");
    await expect(fileWire).toHaveAttribute(
      "data-provenance",
      "auto:nearest-kind",
    );

    // Name-match auto-wire for wildcard Artifact identifier ports:
    // submit.apimRequestId → extract.apimRequestId.
    const idWire = wireGroup(page, "wire:extract:apimRequestId");
    await expect(idWire).toHaveAttribute("data-wire-variant", "data");
    await expect(idWire).toHaveAttribute("data-provenance", "auto:name-match");

    // A wired required input is satisfied…
    await expect(
      page.getByTestId("port-row-submit-in-fileData"),
    ).toHaveAttribute("data-needs-source", "false");
    await expect(
      page.getByTestId("port-row-extract-in-apimRequestId"),
    ).toHaveAttribute("data-needs-source", "false");
    // …while a required input with no upstream producer still needs a source.
    await expect(
      page.getByTestId("port-row-prep-in-documentId"),
    ).toHaveAttribute("data-needs-source", "true");

    expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });

  test("data wires are hoverable and carry the provenance tooltip", async ({
    page,
  }) => {
    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(createdId as string, 5);

    // Regression guard for the pointer-events fix: xyflow marks
    // unselectable edges `.inactive` (pointer-events: none) and the
    // `wb-data-wire` CSS re-enables them. Playwright's hover performs a
    // real hit-target check, so it FAILS if the pane underneath would
    // swallow the pointer instead of the wire.
    const edge = page.locator(
      '.react-flow__edge.wb-data-wire[data-id="wire:extract:apimRequestId"]',
    );
    await edge.hover();

    // The native SVG <title> inside the wire group is the hover tooltip.
    await expect(edge.locator("title")).toHaveText(
      'Connected automatically — matched by name "apimRequestId"',
    );
    // The same provenance is mirrored to assistive tech via aria-label.
    await expect(edge).toHaveAttribute(
      "aria-label",
      'Connected automatically — matched by name "apimRequestId"',
    );

    expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });

  test("an edge with no bindable port pair renders a sequence wire", async ({
    page,
  }) => {
    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(createdId as string, 5);

    // prep → orphan: ocr.cleanup needs an OcrResult, prep only produces a
    // Document — nothing bindable, so the hop is execution-order only.
    const seqWire = wireGroup(page, "e4");
    await expect(seqWire).toHaveAttribute("data-wire-variant", "sequence");
    // Sequence wires carry no provenance and are not hover-enabled.
    await expect(seqWire).not.toHaveAttribute("data-provenance", /.+/);
    await expect(
      page.locator('.react-flow__edge.wb-data-wire[data-id="e4"]'),
    ).toHaveCount(0);

    // orphan's required input stayed unbound → amber "needs a source" state.
    await expect(
      page.getByTestId("port-row-orphan-in-ocrResult"),
    ).toHaveAttribute("data-needs-source", "true");

    expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });
});
