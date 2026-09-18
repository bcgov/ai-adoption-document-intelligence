import { expect, test } from "@playwright/test";
import { setupWorkflowBuilderTest } from "../helpers/wb-test";
import {
  createWorkflow,
  deleteWorkflow,
  getWorkflow,
  type GraphConfig,
} from "../helpers/workflow-api";
import { WorkflowEditorPage } from "../pages/WorkflowEditorPage";

/**
 * Requires the local stack running: frontend on :3000 + backend on :3002.
 * Part of the `tier2` (non-benchmarking) workflow-builder suite — deterministic,
 * design-time only (no Temporal).
 *
 * Tier 2 — conditions from node outputs (PORT_WIRING_DESIGN §11, Phase 5).
 *
 * A control-flow condition's ValueRef "Ref" mode now defaults to a STEP-PICKER:
 * instead of typing a raw ctx key, the user picks an upstream step's output
 * port. Picking a step stores the producer's ctx key in the condition AND — via
 * the settings-form reconcile (`ensureConditionProducerBindings`) — materialises
 * the producer's `outputs[]` binding, so the whole thing round-trips through
 * save/reload. This spec drives that gesture on a switch case's left operand and
 * asserts BOTH halves persist server-side.
 */

const pos = (x: number, y: number) => ({ metadata: { position: { x, y } } });

/**
 * A `file.prepare` activity ("Prepare file") feeding a `switch`. The switch's
 * one case has a comparison with an EMPTY left ref so the step-picker renders
 * (a resolved ref would show its picker with the row pre-selected instead). The
 * switch carries a valid defaultEdge + case edge so the graph passes save-time
 * validation. `file.prepare` emits catalog output port `preparedData`
 * (label "Prepared file data").
 */
function buildSwitchStepRefConfig(name: string): GraphConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name },
    entryNodeId: "prep",
    ctx: {},
    nodes: {
      prep: {
        id: "prep",
        type: "activity",
        label: "Prepare file",
        activityType: "file.prepare",
        ...pos(120, 300),
      },
      routeByType: {
        id: "routeByType",
        type: "switch",
        label: "Branch by condition",
        cases: [
          {
            condition: {
              operator: "equals",
              left: { ref: "" },
              right: { literal: "x" },
            },
            edgeId: "route-a",
          },
        ],
        defaultEdge: "route-default",
        ...pos(560, 300),
      },
      sinkA: {
        id: "sinkA",
        type: "activity",
        label: "Case A",
        activityType: "ocr.cleanup",
        ...pos(1000, 160),
      },
      sinkB: {
        id: "sinkB",
        type: "activity",
        label: "Default",
        activityType: "ocr.storeResults",
        ...pos(1000, 460),
      },
    },
    edges: [
      { id: "prep-switch", source: "prep", target: "routeByType", type: "normal" },
      {
        id: "route-a",
        source: "routeByType",
        target: "sinkA",
        type: "conditional",
        condition: "a",
      },
      {
        id: "route-default",
        source: "routeByType",
        target: "sinkB",
        type: "conditional",
        condition: "default",
      },
    ],
  };
}

/** Testid of the switch case-0 condition's LEFT ValueRef editor. */
const LEFT = "switch-node-settings-case-0-condition-left";
/** Rendered text of the one pickable producer row / the resolved caption. */
const PRODUCER_TEXT = "Prepare file → Prepared file data";
/** The ctx key `file.prepare`'s `preparedData` output synthesises to (no
 * pre-existing binding on `prep`), = `synthesiseCtxKey("prep", "preparedData")`. */
const EXPECTED_CTX_KEY = "__auto.prep.preparedData";

test.describe("condition step-ref (conditions from node outputs)", () => {
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

  test("§11 — picking an upstream step for a switch condition persists both the ref and the producer's output binding", async ({
    page,
    request,
  }, testInfo) => {
    const name = `e2e condition step-ref ${testInfo.testId}`;
    createdId = (
      await createWorkflow(request, {
        name,
        config: buildSwitchStepRefConfig(name),
      })
    ).id;

    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(createdId, 4);

    // Open the switch settings and reach its case-0 condition's left operand.
    await editor.selectNode("routeByType");
    await expect(page.getByTestId("switch-node-settings")).toBeVisible();
    const leftEditor = page.getByTestId(LEFT);
    await expect(leftEditor).toBeVisible();

    // The step-picker is shown by default (Ref mode, empty ref, an upstream
    // producer exists) — NOT the empty state or a manual raw-key input.
    const picker = leftEditor.getByTestId("condition-producer-picker");
    await expect(picker).toBeVisible();
    await expect(
      leftEditor.getByTestId("condition-producer-empty"),
    ).toHaveCount(0);

    // The one upstream producer row is "Prepare file → Prepared file data".
    const producerRow = picker
      .getByTestId("condition-producer-row")
      .filter({ hasText: PRODUCER_TEXT });
    await expect(producerRow).toBeVisible();

    // Before selection there is no resolved caption.
    await expect(page.getByTestId(`${LEFT}-resolved`)).toHaveCount(0);

    // Pick the step — stores the producer's ctx key in the condition.
    await producerRow.click();

    // The resolved caption now names the chosen step + port.
    const resolved = page.getByTestId(`${LEFT}-resolved`);
    await expect(resolved).toBeVisible();
    await expect(resolved).toHaveText(PRODUCER_TEXT);

    // Save + read back: BOTH the condition ref and the producer's output
    // binding must persist (the core Phase-5 round-trip).
    await editor.saveButton.click();

    await expect
      .poll(async () => {
        const wf = await getWorkflow(request, createdId as string);
        const sw = wf.config.nodes.routeByType as unknown as {
          cases: { condition: { left?: { ref?: string } } }[];
        };
        return sw.cases[0]?.condition?.left?.ref;
      })
      .toBe(EXPECTED_CTX_KEY);

    await expect
      .poll(async () => {
        const wf = await getWorkflow(request, createdId as string);
        return wf.config.nodes.prep.outputs?.find(
          (o) => o.port === "preparedData",
        )?.ctxKey;
      })
      .toBe(EXPECTED_CTX_KEY);

    expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });
});
