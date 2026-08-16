import { expect, test } from "@playwright/test";
import { setupWorkflowBuilderTest } from "../helpers/wb-test";
import {
  createWorkflow,
  deleteWorkflow,
  type GraphConfig,
  getWorkflow,
} from "../helpers/workflow-api";
import { WorkflowEditorPage } from "../pages/WorkflowEditorPage";

/**
 * Tier 2 — D24: the map node's item ctx key default, and the collision warning
 * that pays for it.
 *
 * Both halves are invisible to jsdom. The default is applied by the PALETTE
 * DROP path, which only exists on a mounted React Flow canvas, and the warning
 * has to be seen where an author would see it — the top-bar validation button
 * and the Validation drawer — not merely returned by `validateGraphConfig`.
 * The unit tests pin the values (`control-flow-skeletons.test.ts`) and the rule
 * (`validator-map-item-key-collision.test.ts`); this pins that an author
 * actually meets them.
 *
 * Deterministic (design-time only) — no Temporal, default CI tier.
 */

/** The smallest valid graph: one activity, no control flow at all. */
function buildSeedConfig(name: string): GraphConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name },
    entryNodeId: "prep",
    ctx: { blobKey: { type: "string" }, documents: { type: "array" } },
    nodes: {
      prep: {
        id: "prep",
        type: "activity",
        label: "Prepare",
        activityType: "file.prepare",
        inputs: [{ port: "blobKey", ctxKey: "blobKey" }],
        metadata: { position: { x: 80, y: 100 } },
      },
    },
    edges: [],
  };
}

test.describe("map item ctx key default + collision warning (D24)", () => {
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

  /**
   * Add a control-flow node by clicking its palette entry. The palette entry is
   * both draggable and clickable; the click path runs the same
   * `addControlFlowNode` handler a drop does, so it exercises
   * `buildControlFlowSkeleton` identically without simulating a HTML5 drag.
   */
  async function dropMapNode(
    page: import("@playwright/test").Page,
  ): Promise<void> {
    await page.getByTestId("control-flow-palette-entry-map").click();
  }

  test("a freshly dropped map arrives with its item variable pre-filled", async ({
    page,
    request,
  }) => {
    const name = `e2e map default ${test.info().testId}`;
    createdId = (
      await createWorkflow(request, { name, config: buildSeedConfig(name) })
    ).id;
    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(createdId, 1);

    await dropMapNode(page);

    // The new node is auto-selected on add, so its settings form is already up.
    await expect(page.getByTestId("map-node-settings")).toBeVisible();
    // The point of D24: this used to be "" — a required field that is a hard
    // validation error the instant the node exists.
    await expect(
      page.getByTestId("map-node-settings-item-ctx-key"),
    ).toHaveValue("currentSegment");
    // The collection key has no defensible default and is still blank, so the
    // author still has one thing to fill in rather than none.
    await expect(
      page.getByTestId("map-node-settings-collection-ctx-key"),
    ).toHaveValue("");

    expect(pageErrors).toEqual([]);
  });

  test("a saved map keeps the key it was authored with — no migration on load", async ({
    page,
    request,
  }) => {
    // The seeded demo graph uses `currentDoc`; the default must not touch it.
    const name = `e2e map preserve ${test.info().testId}`;
    const config = buildSeedConfig(name);
    config.ctx.currentDoc = { type: "object" };
    config.nodes.eachDoc = {
      id: "eachDoc",
      type: "map",
      label: "Run for each document",
      collectionCtxKey: "documents",
      itemCtxKey: "currentDoc",
      maxConcurrency: 5,
      bodyEntryNodeId: "prep",
      bodyExitNodeId: "prep",
      metadata: { position: { x: 420, y: 320 } },
    };
    createdId = (await createWorkflow(request, { name, config })).id;

    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(createdId, 2);
    await editor.selectNode("eachDoc");
    await expect(
      page.getByTestId("map-node-settings-item-ctx-key"),
    ).toHaveValue("currentDoc");

    // And the stored config is untouched — reading the form is not proof the
    // config on disk survived a load.
    const wf = await getWorkflow(request, createdId);
    expect(wf.config.nodes.eachDoc.itemCtxKey).toBe("currentDoc");
  });

  test("a second map collides on the default key, warns, and still saves", async ({
    page,
    request,
  }) => {
    const name = `e2e map collision ${test.info().testId}`;
    createdId = (
      await createWorkflow(request, { name, config: buildSeedConfig(name) })
    ).id;
    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(createdId, 1);

    await dropMapNode(page);
    await expect(
      page.getByTestId("map-node-settings-item-ctx-key"),
    ).toHaveValue("currentSegment");
    await dropMapNode(page);
    await expect(
      page.getByTestId("map-node-settings-item-ctx-key"),
    ).toHaveValue("currentSegment");

    // The top-bar validation button is the first place an author sees it. Both
    // maps are also missing their collection key, so there are errors too — the
    // button renders "N errors · M warnings" once both are present.
    const validationButton = page.getByRole("button", {
      name: /\d+ warnings?/,
    });
    await expect(validationButton).toBeVisible({ timeout: 10_000 });

    // The drawer is where the message itself lives.
    await validationButton.click();
    const warningRow = page.getByText(/reuses the item variable/);
    await expect(warningRow).toBeVisible();
    const text = (await warningRow.textContent()) ?? "";
    expect(text).toContain("currentSegment");
    // Both maps arrive with the palette's default label, so the incumbent is
    // described rather than named — naming it would repeat the same string.
    expect(text).toContain("another loop on this canvas");
    // Says what will happen, and what to do about it.
    expect(text).toContain("bind to the wrong loop");
    expect(text).toContain("Give this loop its own item variable");

    await page.keyboard.press("Escape");

    // It is a WARNING: Save must go through. (The missing collection keys are
    // errors, so this also confirms the editor's Save is not gated on validity
    // — what must be shown is that the collision adds no new obstacle.)
    await editor.saveButton.click();
    await expect(page.getByText(/saved/i).first()).toBeVisible({
      timeout: 15_000,
    });

    const wf = await getWorkflow(request, createdId);
    const mapKeys = Object.values(wf.config.nodes)
      .filter((n) => n.type === "map")
      .map((n) => n.itemCtxKey);
    expect(mapKeys).toHaveLength(2);
    expect(mapKeys).toEqual(["currentSegment", "currentSegment"]);

    expect(pageErrors).toEqual([]);
  });
});
