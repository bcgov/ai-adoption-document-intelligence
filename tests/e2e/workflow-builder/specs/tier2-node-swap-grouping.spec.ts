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
 * Tier 2 — node-type swap (6.6) + grouping / exposed-param pruning (6.2, 6.4).
 * Manual test plan Part 6.
 *
 * These carry real state-transform logic that unit tests alone don't exercise
 * end-to-end: a type swap must preserve the node id + position while changing
 * `activityType`, and removing a group member must prune any exposed parameter
 * that referenced it. Both are driven through the actual canvas context menu /
 * settings panel and verified against the persisted config.
 *
 * Deterministic (design-time only) — no Temporal, default CI tier.
 */

const pos = (x: number, y: number) => ({ metadata: { position: { x, y } } });

/** An activity node + a switch node — the swap-allowed vs swap-blocked pair. */
function buildSwapConfig(name: string): GraphConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name },
    entryNodeId: "prep",
    ctx: { blobKey: { type: "string" }, kind: { type: "string" } },
    nodes: {
      prep: {
        id: "prep",
        type: "activity",
        label: "Prepare File Data",
        activityType: "file.prepare",
        inputs: [{ port: "blobKey", ctxKey: "blobKey" }],
        ...pos(400, 120),
      },
      route: {
        id: "route",
        type: "switch",
        label: "Branch by condition",
        cases: [
          {
            condition: {
              operator: "equals",
              left: { ref: "ctx.kind" },
              right: { literal: "a" },
            },
            edgeId: "c1",
          },
        ],
        defaultEdge: "c2",
        ...pos(400, 320),
      },
      store: {
        id: "store",
        type: "activity",
        label: "Store Results",
        activityType: "ocr.storeResults",
        ...pos(720, 220),
      },
      end: {
        id: "end",
        type: "activity",
        label: "Cleanup",
        activityType: "ocr.cleanup",
        ...pos(720, 420),
      },
    },
    edges: [
      { id: "e0", source: "prep", target: "route", type: "normal" },
      {
        id: "c1",
        source: "route",
        target: "store",
        type: "conditional",
        condition: "a",
      },
      {
        id: "c2",
        source: "route",
        target: "end",
        type: "conditional",
        condition: "default",
      },
    ],
  };
}

/**
 * Two activities pre-organised into a group with an exposed parameter that
 * references the `submit` member. Pre-seeding the group (rather than building it
 * through the canvas) sidesteps a create-time selection race — creating a group
 * via "Group selected" re-emits the canvas selection, which clears
 * `activeGroupId` before the panel can settle, so that gesture stays manual
 * (plan 6.2). We drive the durable prune logic instead.
 */
function buildGroupConfig(name: string): GraphConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name },
    entryNodeId: "prep",
    ctx: {
      blobKey: { type: "string" },
      preparedFileData: { type: "object" },
      apimRequestId: { type: "string" },
    },
    nodes: {
      prep: {
        id: "prep",
        type: "activity",
        label: "Prepare File Data",
        activityType: "file.prepare",
        inputs: [{ port: "blobKey", ctxKey: "blobKey" }],
        outputs: [{ port: "preparedData", ctxKey: "preparedFileData" }],
        ...pos(500, 160),
      },
      submit: {
        id: "submit",
        type: "activity",
        label: "Submit to Azure OCR",
        activityType: "azureOcr.submit",
        inputs: [{ port: "fileData", ctxKey: "preparedFileData" }],
        outputs: [{ port: "apimRequestId", ctxKey: "apimRequestId" }],
        ...pos(760, 160),
      },
    },
    edges: [{ id: "e1", source: "prep", target: "submit", type: "normal" }],
    nodeGroups: {
      grp: {
        label: "OCR Extraction",
        description: "Prepare + submit",
        nodeIds: ["prep", "submit"],
        exposedParams: [
          {
            label: "OCR knob",
            nodeId: "submit",
            path: "nodes.submit.label",
            type: "string",
          },
        ],
      },
    },
  };
}

test.describe("node-type swap + grouping", () => {
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

  test("6.6 — an activity node's type can be swapped; a control-flow node's cannot", async ({
    page,
    request,
  }) => {
    createdId = (
      await createWorkflow(request, {
        name: `e2e node-swap ${test.info().testId}`,
        config: buildSwapConfig(`e2e node-swap ${test.info().testId}`),
      })
    ).id;
    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(createdId, 4);

    // Activity node → "Change activity type" is enabled and opens the picker.
    // (The Mantine Modal root stays mounted-but-hidden, so key off its content.)
    await editor.openNodeContextMenu("prep");
    await page.getByTestId("context-menu-change-activity-type").click();
    const search = page.getByTestId("node-type-swap-modal-search");
    await search.waitFor({ state: "visible" });
    await search.fill("cleanup");
    await page.getByTestId("node-type-swap-entry-ocr.cleanup").click();
    await expect(search).toBeHidden();

    await editor.saveButton.click();
    // The node keeps its id but adopts the new activityType.
    await expect
      .poll(async () => {
        const wf = await getWorkflow(request, createdId as string);
        return wf.config.nodes.prep.activityType;
      })
      .toBe("ocr.cleanup");

    // Control-flow node → the same entry is disabled.
    await editor.openNodeContextMenu("route");
    await expect(
      page.locator(
        '[data-testid="context-menu-change-activity-type"][data-disabled]',
      ),
    ).toBeVisible();

    expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });

  test("6.3 / 6.4 — a group's simplified-view chip opens its settings; removing a member prunes its exposed param", async ({
    page,
    request,
  }) => {
    createdId = (
      await createWorkflow(request, {
        name: `e2e grouping ${test.info().testId}`,
        config: buildGroupConfig(`e2e grouping ${test.info().testId}`),
      })
    ).id;
    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(createdId, 2);

    // 6.3 — turn on Simplified view; the group collapses to a clickable chip.
    // The Mantine Switch's real <input> is visually hidden off-viewport, so
    // click its visible track (the label) inside the menu item.
    await editor.openMoreMenu();
    await page
      .getByTestId("topbar-menu-simplified-view")
      .locator(".mantine-Switch-track")
      .click();
    await page.keyboard.press("Escape"); // close the More menu

    // Clicking the chip activates the group (nodes are collapsed, so nothing
    // gets re-selected out from under it).
    const chip = page.locator('.react-flow__node[data-id="group-chip-grp"]');
    await chip.waitFor({ state: "visible" });
    const box = await chip.boundingBox();
    if (!box) throw new Error("group chip has no bounding box");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    // Group settings open, showing both members + the pre-seeded exposed param.
    await expect(page.getByTestId("group-node-settings")).toBeVisible();
    await expect(
      page.getByTestId("group-settings-remove-node-prep"),
    ).toBeVisible();
    await expect(
      page.getByTestId("group-settings-remove-node-submit"),
    ).toBeVisible();
    await expect(page.getByTestId("exposed-params-row-0")).toBeVisible();

    // 6.4 — remove the referenced member → the exposed param is pruned + a toast.
    await page.getByTestId("group-settings-remove-node-submit").click();
    await expect(page.getByText("Exposed parameter dropped")).toBeVisible();
    await expect(page.getByTestId("exposed-params-row-0")).toHaveCount(0);
    // The group survives with its remaining member.
    await expect(
      page.getByTestId("group-settings-remove-node-prep"),
    ).toBeVisible();

    // Persisted: the group has no exposed params and only `prep` left.
    await editor.saveButton.click();
    await expect
      .poll(async () => {
        const wf = await getWorkflow(request, createdId as string);
        const grp = wf.config.nodeGroups?.grp as
          | { nodeIds: string[]; exposedParams?: unknown[] }
          | undefined;
        return {
          members: grp?.nodeIds ?? [],
          exposed: grp?.exposedParams?.length ?? 0,
        };
      })
      .toEqual({ members: ["prep"], exposed: 0 });

    expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });
});
