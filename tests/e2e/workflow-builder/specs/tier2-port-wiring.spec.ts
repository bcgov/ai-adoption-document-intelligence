import { expect, Page, test } from "@playwright/test";
import { dragConnect, dragConnectPorts } from "../helpers/canvas";
import { setupWorkflowBuilderTest } from "../helpers/wb-test";
import {
  createWorkflow,
  deleteWorkflow,
  getWorkflow,
  type GraphConfig,
} from "../helpers/workflow-api";
import { WorkflowEditorPage } from "../pages/WorkflowEditorPage";

/**
 * Tier 2 — port-wiring gestures (PORT_WIRING_DESIGN.md §6/§9, Phase 3).
 *
 * Where tier2-typed-io asserts the RENDER of API-built graphs, this spec
 * drives the actual gestures: drag-to-bind (§6.1), connect-time kind
 * rejection (§6.2), wire delete → pinned-unbound → revert (§6.3), the
 * node-level connect summary popover (§6.4), and the kind-aware
 * hover-extend popover (§9).
 *
 * Real catalog kinds used (packages/graph-workflow/src/catalog/activities):
 *   - file.prepare        out preparedData: PreparedFile
 *   - azureOcr.submit     in  fileData: PreparedFile (compatible with prepare)
 *   - azureOcr.extract    in  apimRequestId: Artifact (required, name-match
 *                         only — NOT kind-satisfied by a Document producer)
 *                         out ocrResult: OcrResult
 *   - ocr.cleanup         in  ocrResult: OcrResult
 *   - document.split      in  blobKey: MultiPageDocument — PreparedFile is NOT
 *                         assignable to MultiPageDocument (isAssignable walks
 *                         MultiPageDocument's baseKind chain UP to Document,
 *                         not the reverse), so prep→split is the incompatible
 *                         pair for §6.2.
 *
 * Node positions are staggered diagonally on purpose (see tier2-typed-io):
 * a perfectly horizontal/vertical wire has a zero-height/width bounding box,
 * which Playwright treats as hidden, and click-to-select needs the wire's
 * bbox center to land ON the path (true for any straight diagonal line).
 */

const pos = (x: number, y: number) => ({ metadata: { position: { x, y } } });

/** Inner wire <g> (variant/provenance carrier) of a data wire, by wire id. */
function wireGroup(page: Page, wireId: string) {
  return page.locator(`.react-flow__edge[data-id="${wireId}"] g[data-wire-variant]`);
}

function edgeLocator(page: Page, wireId: string) {
  return page.locator(`.react-flow__edge[data-id="${wireId}"]`);
}

/** Snapshot of every rendered node's data-id, for diffing after a mutation. */
async function nodeIds(page: Page): Promise<string[]> {
  return page.locator(".react-flow__node").evaluateAll((nodes) =>
    nodes
      .map((n) => n.getAttribute("data-id"))
      .filter((id): id is string => id !== null),
  );
}

test.describe("port wiring gestures", () => {
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

  test("drag-to-bind pins a port-to-port binding and survives a reload (§6.1)", async ({
    page,
    request,
  }, testInfo) => {
    const config: GraphConfig = {
      schemaVersion: "1.0",
      metadata: { name: "e2e drag-to-bind" },
      entryNodeId: "prep",
      ctx: {},
      nodes: {
        prep: {
          id: "prep",
          type: "activity",
          label: "Prepare",
          activityType: "file.prepare",
          ...pos(80, 120),
        },
        submit: {
          id: "submit",
          type: "activity",
          label: "Submit OCR",
          activityType: "azureOcr.submit",
          ...pos(560, 420),
        },
      },
      edges: [],
    };
    const created = await createWorkflow(request, {
      name: `e2e drag-to-bind ${testInfo.testId}`,
      config,
    });
    createdId = created.id;

    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(createdId, 2);

    // Precondition: no wire between prep and submit yet — no edges, no
    // bindings, so `deriveWires` produces nothing for this pair.
    await expect(edgeLocator(page, "wire:submit:fileData")).toHaveCount(0);

    await dragConnectPorts(page, "prep", "preparedData", "submit", "fileData");

    const wire = wireGroup(page, "wire:submit:fileData");
    await expect(wire).toHaveAttribute("data-wire-variant", "data");
    await expect(wire).toHaveAttribute("data-provenance", "pinned");

    // Persist + verify server-side.
    await editor.saveButton.click();
    await expect
      .poll(async () => {
        const wf = await getWorkflow(request, createdId as string);
        return wf.config.nodes.submit?.inputs?.find(
          (i) => i.port === "fileData",
        )?.ctxKey;
      })
      .toBeTruthy();
    await expect
      .poll(async () => {
        const wf = await getWorkflow(request, createdId as string);
        const locks = wf.config.nodes.submit?.metadata as unknown as
          | { lockedInputPorts?: string[] }
          | undefined;
        return locks?.lockedInputPorts ?? [];
      })
      .toContain("fileData");

    // Reload — the pinned wire re-renders from the persisted binding.
    await editor.openExisting(createdId, 2);
    const reloadedWire = wireGroup(page, "wire:submit:fileData");
    await expect(reloadedWire).toHaveAttribute("data-wire-variant", "data");
    await expect(reloadedWire).toHaveAttribute("data-provenance", "pinned");

    expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });

  test("dropping on an incompatible-kind port is rejected with no wire + a notice (§6.2)", async ({
    page,
    request,
  }, testInfo) => {
    const config: GraphConfig = {
      schemaVersion: "1.0",
      metadata: { name: "e2e incompatible drop" },
      entryNodeId: "prep",
      ctx: {},
      nodes: {
        prep: {
          id: "prep",
          type: "activity",
          label: "Prepare",
          activityType: "file.prepare",
          ...pos(80, 120),
        },
        split: {
          id: "split",
          type: "activity",
          label: "Split Document",
          activityType: "document.split",
          parameters: { strategy: "per-page" },
          ...pos(560, 420),
        },
      },
      edges: [],
    };
    const created = await createWorkflow(request, {
      name: `e2e incompatible drop ${testInfo.testId}`,
      config,
    });
    createdId = created.id;

    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(createdId, 2);

    // prep.preparedData is Document; split.blobKey is MultiPageDocument —
    // isAssignable(Document, MultiPageDocument) is false (the child kind
    // does not walk back down to its base), so this drop must be rejected.
    await dragConnectPorts(page, "prep", "preparedData", "split", "blobKey");

    await expect(edgeLocator(page, "wire:split:blobKey")).toHaveCount(0);
    // Substring assertion per the current copy
    // (`This input needs <TargetKind> — <SourceKind> can't be used here`) —
    // resilient to which two kind names are involved.
    await expect(page.getByText("can't be used here")).toBeVisible();

    expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });

  test("deleting a data wire disconnects the binding; Revert to automatic hands it back (§6.3/§7)", async ({
    page,
    request,
  }, testInfo) => {
    const config: GraphConfig = {
      schemaVersion: "1.0",
      metadata: { name: "e2e delete revert" },
      entryNodeId: "prep",
      ctx: {},
      nodes: {
        prep: {
          id: "prep",
          type: "activity",
          label: "Prepare",
          activityType: "file.prepare",
          ...pos(80, 100),
        },
        submit: {
          id: "submit",
          type: "activity",
          label: "Submit OCR",
          activityType: "azureOcr.submit",
          ...pos(500, 100),
        },
        extract: {
          id: "extract",
          type: "activity",
          label: "Extract",
          activityType: "azureOcr.extract",
          ...pos(80, 480),
        },
        clean: {
          id: "clean",
          type: "activity",
          label: "Cleanup",
          activityType: "ocr.cleanup",
          // A compact 2x2 grid (not the layout's far corner — see
          // tier2-typed-io.spec.ts's note on an otherwise-identical
          // fixture, where the rightmost node's painted position ends up
          // unclickable at that fitView zoom). The extract→clean wire this
          // test clicks lands in the gap between the two columns, clear of
          // every node's card — edges render behind node cards, so any
          // overlap would eat the click.
          ...pos(520, 600),
        },
      },
      edges: [
        { id: "e1", source: "prep", target: "submit", type: "normal" },
        { id: "e2", source: "submit", target: "extract", type: "normal" },
        { id: "e3", source: "extract", target: "clean", type: "normal" },
      ],
    };
    const created = await createWorkflow(request, {
      name: `e2e delete revert ${testInfo.testId}`,
      config,
    });
    createdId = created.id;

    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(createdId, 4);

    // Auto-wired precondition (mirrors tier2-typed-io's chain fixture):
    // extract.ocrResult (OcrResult) → clean.ocrResult (OcrResult).
    const wire = wireGroup(page, "wire:clean:ocrResult");
    await expect(wire).toHaveAttribute("data-provenance", "auto:nearest-kind");

    // Select the wire (click lands on its path — for a diagonal edge the
    // bbox center sits exactly on the line) and delete it.
    await edgeLocator(page, "wire:clean:ocrResult").click();
    await expect(edgeLocator(page, "wire:clean:ocrResult")).toHaveClass(
      /selected/,
    );
    await page.keyboard.press("Delete");

    await expect(edgeLocator(page, "wire:clean:ocrResult")).toHaveCount(0);
    await expect(
      page.getByTestId("port-row-clean-in-ocrResult"),
    ).toHaveAttribute("data-needs-source", "true");

    // Revert to automatic — select the node, open Inputs, click Revert.
    await editor.selectNode("clean");
    const inputsSection = page.getByTestId("inputs-section");
    await expect(inputsSection).toBeVisible();
    await inputsSection.getByRole("button", { name: "Revert to automatic" }).click();

    const revertedWire = wireGroup(page, "wire:clean:ocrResult");
    await expect(revertedWire).toBeVisible();
    const provenance = await revertedWire.getAttribute("data-provenance");
    expect(provenance?.startsWith("auto")).toBeTruthy();

    expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });

  test("a node-level connect opens the connect-summary popover (§6.4)", async ({
    page,
    request,
  }, testInfo) => {
    const config: GraphConfig = {
      schemaVersion: "1.0",
      metadata: { name: "e2e connect summary" },
      entryNodeId: "prep",
      ctx: {},
      nodes: {
        prep: {
          id: "prep",
          type: "activity",
          label: "Prepare",
          activityType: "file.prepare",
          ...pos(80, 120),
        },
        extract: {
          id: "extract",
          type: "activity",
          label: "Extract",
          activityType: "azureOcr.extract",
          ...pos(560, 420),
        },
      },
      edges: [],
    };
    const created = await createWorkflow(request, {
      name: `e2e connect summary ${testInfo.testId}`,
      config,
    });
    createdId = created.id;

    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(createdId, 2);

    // Node-level connect: prep has no ctx key extract's `apimRequestId`
    // (Artifact, name-match only) can bind to, so the auto-wire pass
    // leaves it unsatisfied — a real ⚠ row with a Fix button.
    await dragConnect(page, "prep", "extract");

    const popover = page.getByTestId("connect-summary-popover");
    await expect(popover).toBeVisible();
    const row = page.getByTestId("connect-summary-row-apimRequestId");
    await expect(row).toBeVisible();
    await expect(row).toContainText("needs a source");

    const fixButton = page.getByTestId("connect-summary-fix-apimRequestId");
    await expect(fixButton).toBeVisible();
    await fixButton.click();

    // Fix deep-links into the settings-panel source picker for that port.
    await expect(page.getByTestId("inputs-section")).toBeVisible();
    await expect(page.getByText("Choose a source")).toBeVisible();

    expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });

  test("hovering a typed output handle opens the kind-filtered extend popover (§9)", async ({
    page,
    request,
  }, testInfo) => {
    const config: GraphConfig = {
      schemaVersion: "1.0",
      metadata: { name: "e2e port-aware extend" },
      entryNodeId: "prep",
      ctx: {},
      nodes: {
        prep: {
          id: "prep",
          type: "activity",
          label: "Prepare",
          activityType: "file.prepare",
          ...pos(80, 120),
        },
      },
      edges: [],
    };
    const created = await createWorkflow(request, {
      name: `e2e port-aware extend ${testInfo.testId}`,
      config,
    });
    createdId = created.id;

    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(createdId, 1);

    const before = await nodeIds(page);

    // Hover the typed `out-preparedData` (Document) handle and wait past
    // the 200ms open debounce (use-hover-extend.ts HOVER_DEBOUNCE_MS).
    const outHandle = page.locator(
      '.react-flow__node[data-id="prep"] .react-flow__handle[data-handleid="out-preparedData"]',
    );
    await outHandle.hover();
    await page.waitForTimeout(400);

    const popover = page.getByTestId("hover-extend-popover");
    await expect(popover).toBeVisible();
    // Filtered mode: the "Show all" escape is present…
    await expect(page.getByTestId("hover-extend-show-all")).toBeVisible();
    // …azureOcr.submit (fileData: Document, exact-kind match) is offered…
    await expect(
      page.getByTestId("hover-extend-activity-azureOcr.submit"),
    ).toBeVisible();
    // …while document.split (blobKey: MultiPageDocument — Document is NOT
    // assignable to it) is filtered OUT of the ranked list.
    await expect(
      page.getByTestId("hover-extend-activity-document.split"),
    ).toHaveCount(0);

    await page.getByTestId("hover-extend-activity-azureOcr.submit").click();

    // The new node lands pre-wired: diff the node-id set to find it (the
    // canvas mints a random suffix, unpredictable from the outside).
    await expect
      .poll(async () => (await nodeIds(page)).length)
      .toBe(before.length + 1);
    const after = await nodeIds(page);
    const newNodeId = after.find((id) => !before.includes(id));
    expect(newNodeId).toBeTruthy();

    const wire = wireGroup(page, `wire:${newNodeId}:fileData`);
    await expect(wire).toHaveAttribute("data-wire-variant", "data");
    await expect(wire).toHaveAttribute("data-provenance", "pinned");

    expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });

  test("base64 content is rejected by a blob-key port (taxonomy sibling rejection)", async ({
    page,
    request,
  }, testInfo) => {
    const config: GraphConfig = {
      schemaVersion: "1.0",
      metadata: { name: "e2e sibling rejection" },
      entryNodeId: "readBlob",
      ctx: {},
      nodes: {
        readBlob: {
          id: "readBlob",
          type: "activity",
          label: "Read Blob",
          activityType: "blob.read",
          ...pos(80, 120),
        },
        extract: {
          id: "extract",
          type: "activity",
          label: "Extract Page Range",
          activityType: "document.extractToBase64",
          ...pos(560, 420),
        },
      },
      edges: [],
    };
    const created = await createWorkflow(request, {
      name: `e2e sibling rejection ${testInfo.testId}`,
      config,
    });
    createdId = created.id;

    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(createdId, 2);

    // readBlob.base64 is DocumentContent; extract.blobKey is DocumentRef.
    // Siblings under Document are not interchangeable — before the taxonomy
    // wave this drop was accepted (both were "Document") and failed at run
    // time; now the builder rejects it at draw time.
    await dragConnectPorts(page, "readBlob", "base64", "extract", "blobKey");

    await expect(edgeLocator(page, "wire:extract:blobKey")).toHaveCount(0);
    await expect(page.getByText("can't be used here")).toBeVisible();

    expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });
});
