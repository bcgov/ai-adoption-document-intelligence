import { expect, test } from "@playwright/test";
import { setupWorkflowBuilderTest } from "../helpers/wb-test";
import {
  createWorkflow,
  deleteWorkflow,
  type GraphConfig,
} from "../helpers/workflow-api";
import { WorkflowEditorPage } from "../pages/WorkflowEditorPage";

/**
 * Tier 2 — cross-feature coupling invariants.
 *
 * These are not feature tests. Each one pins an agreement between modules that
 * cannot see each other, which is where this codebase has actually broken: the
 * defects found by the 2026-07-25 walkthrough were, without exception, two
 * individually-correct decisions that were wrong in combination.
 *
 * Selection rule: a spec earns a place here only if the invariant spans
 * subsystems AND that code is still moving. "Hard to notice when broken" is a
 * multiplier on the damage, not a reason on its own — most of the walkthrough's
 * findings were never-worked construction defects, which get fixed once and do
 * not need a guard.
 *
 * Deliberately NOT duplicated here:
 *   - connect-time kind rejection → tier2-port-wiring.spec.ts (§6.2)
 *   - variable-picker scope resolution → graph-widgets/variable-picker-scope
 *   - the upstream walk's distances → graph-workflow/auto-wire/upstream-walk
 *
 * Graphs are built through the API rather than by clicking the palette: it is
 * faster, and it lets each test state the exact shape the invariant is about.
 */

const pos = (x: number, y: number) => ({ metadata: { position: { x, y } } });

const base = (name: string): Omit<GraphConfig, "nodes" | "edges"> => ({
  schemaVersion: "1.0",
  metadata: { name },
  entryNodeId: "",
  ctx: {},
});

test.describe("coupling invariants", () => {
  const created: string[] = [];

  test.beforeEach(async ({ page }) => {
    await setupWorkflowBuilderTest(page);
  });

  test.afterAll(async ({ request }) => {
    for (const id of created) await deleteWorkflow(request, id).catch(() => {});
  });

  /**
   * G-104 + G-106. Four modules must agree that a map's item is published on a
   * port literally named "item": the resolver (resolve-input-port), the
   * ctx-writes enumeration (ctx-source), the wire deriver (derive-wires) and
   * the pin path (wire-mutations). There is no single source of truth forcing
   * that agreement — add a seventh control-flow producer type and you will
   * touch two of the three.
   *
   * The shape here is the one BOTH shipped maps have: the map reaches its body
   * through the bodyEntryNodeId SETTING, with no edge drawn from map to body.
   * Before G-106 ruling A a body node saw nothing at all in that shape.
   */
  test("a map's item wire draws, and binds to the key the map really writes", async ({
    page,
    request,
  }) => {
    const config: GraphConfig = {
      ...base("e2e coupling — map item"),
      entryNodeId: "split",
      ctx: { segments: { type: "array" } },
      nodes: {
        split: {
          id: "split",
          type: "activity",
          activityType: "document.split",
          label: "Split",
          parameters: { strategy: "per-page" },
          outputs: [{ port: "segments", ctxKey: "segments" }],
          ...pos(0, 0),
        },
        loop: {
          id: "loop",
          type: "map",
          label: "Each segment",
          collectionCtxKey: "segments",
          // The author's chosen variable name. The PORT is "item"; the ctx KEY
          // is this. Conflating the two is the defect being guarded.
          itemCtxKey: "currentSegment",
          bodyEntryNodeId: "classify",
          bodyExitNodeId: "classify",
          ...pos(260, 140),
        },
        classify: {
          id: "classify",
          type: "activity",
          activityType: "document.classify",
          label: "Classify",
          parameters: {
            classifierType: "rule-based",
            rules: [
              {
                name: "invoice",
                resultType: "invoice",
                patterns: [
                  { scope: "fullText", operator: "contains", value: "invoice" },
                ],
              },
            ],
          },
          ...pos(520, 300),
        },
      },
      // NOTE: only split → loop. No loop → classify edge, deliberately.
      edges: [{ id: "e1", source: "split", target: "loop", type: "normal" }],
    };

    const wf = await createWorkflow(request, {
      name: config.metadata.name,
      config,
    });
    created.push(wf.id);

    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(wf.id, 3);

    // The wire exists, is attributed to the loop, and is AUTOMATIC — not the
    // "Pinned by you" a hand-typed key would produce.
    const wire = page.locator('[data-provenance="auto:map-item"]');
    await expect(wire).toHaveCount(1);
    await expect(wire).toContainText("item from the loop");

    // The binding must be the map's own ctx key. A synthesised
    // `__auto.<mapId>.item` would point at something no run ever writes — and
    // the old pin path also stamped an outputs[] row that made that dead key
    // decode as healthy on every surface.
    await editor.selectNode("classify");
    await expect(page.getByTestId("inputs-section")).toContainText(
      "Each segment",
    );
    await page.getByTestId("node-settings-advanced-toggle").click();
    await expect(
      page.locator('input[value="currentSegment"]'),
    ).toHaveCount(1);
    await expect(
      page.locator('input[value^="__auto."][value$=".item"]'),
    ).toHaveCount(0);
  });

  // The "dead-end branch still sees the loop variables" invariant lives in
  // graph-widgets/loop-scope-coupling.test.ts instead of here. It is a pure
  // question about scope resolution, and driving a Mantine Autocomplete open
  // through the canvas added flake without adding coverage — the component
  // test exercises analyzeMapBody and buildVariableOptions together, which is
  // exactly the coupling at issue.

  /**
   * Drawing an error edge is a CANVAS gesture that must write into SETTINGS
   * state (`errorPolicy.fallbackEdgeId`). If it stops recording, the canvas
   * shows a red "on error" edge that the runtime will never take — the picture
   * and the execution disagree, with the picture looking right.
   */
  test("an error edge records itself as the node's fallback", async ({
    page,
    request,
  }) => {
    const config: GraphConfig = {
      ...base("e2e coupling — error edge records fallback"),
      entryNodeId: "prep",
      nodes: {
        prep: {
          id: "prep",
          type: "activity",
          activityType: "file.prepare",
          label: "Prepare",
          errorPolicy: { onError: "fallback", fallbackEdgeId: "e-err" },
          ...pos(0, 0),
        },
        reject: {
          id: "reject",
          type: "activity",
          activityType: "document.storeRejection",
          label: "Store Rejection",
          ...pos(360, 220),
        },
      },
      edges: [
        { id: "e-err", source: "prep", target: "reject", type: "error" },
      ],
    };

    const wf = await createWorkflow(request, {
      name: config.metadata.name,
      config,
    });
    created.push(wf.id);

    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(wf.id, 2);

    // The edge renders as an error edge on the canvas…
    await expect(page.getByTestId("edge-label")).toContainText("on error");
    // …and the settings panel names it, so no unclearable
    // "requires fallbackEdgeId" validation error is left behind.
    await editor.selectNode("prep");
    await expect(page.getByTestId("error-policy-section")).toBeVisible();
    await expect(page.getByTestId("error-policy-fallback-edge")).toHaveValue(
      /Store Rejection/,
    );
  });

  /**
   * A pollUntil wraps a catalog activity. The settings panel lists that
   * activity's inputs and the problems badge counts them — so the CARD has to
   * render matching port rows, or there is nothing on canvas to drag to and two
   * surfaces give opposite answers about the same node. pollUntil is the only
   * control-flow type that wraps an activity, so every catalog change can break
   * it and nothing else exercises the path.
   */
  test("a pollUntil renders the ports of the activity it wraps", async ({
    page,
    request,
  }) => {
    const config: GraphConfig = {
      ...base("e2e coupling — pollUntil inherits ports"),
      entryNodeId: "poll",
      ctx: { apimRequestId: { type: "string" } },
      nodes: {
        poll: {
          id: "poll",
          type: "pollUntil",
          label: "Wait for submit",
          activityType: "azureOcr.submit",
          interval: "30s",
          condition: {
            operator: "not-equals",
            left: { ref: "ctx.apimRequestId" },
            right: { literal: "" },
          },
          ...pos(0, 0),
        },
      },
      edges: [],
    };

    const wf = await createWorkflow(request, {
      name: config.metadata.name,
      config,
    });
    created.push(wf.id);

    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(wf.id, 1);

    // The wrapped activity's ports appear as rows on the control-flow card.
    await expect(page.getByTestId("port-row-poll-in-fileData")).toBeVisible();
    await expect(
      page.getByTestId("port-row-poll-out-apimRequestId"),
    ).toBeVisible();
    // Control-flow chrome is kept — this is still a pollUntil, not an activity.
    await editor.selectNode("poll");
    await expect(page.getByTestId("poll-until-node-settings")).toBeVisible();
  });

  /**
   * Deleting a node prunes the ctx declarations it orphaned. That pruning was
   * deliberately moved to a shared choke point so no delete path could forget
   * it — and there are many call sites (Delete key, context menu, multi-select,
   * group delete, node swap), with new ones appearing over time. Undo must
   * restore BOTH the node and the declarations; restoring only the node leaves
   * a canvas that looks correct over a config that is missing a variable.
   */
  test("deleting a producer reports the blast radius, and undo restores it", async ({
    page,
    request,
  }) => {
    const config: GraphConfig = {
      ...base("e2e coupling — delete prunes ctx"),
      entryNodeId: "prep",
      ctx: { preparedFile: { type: "object" } },
      nodes: {
        prep: {
          id: "prep",
          type: "activity",
          activityType: "file.prepare",
          label: "Prepare File",
          outputs: [{ port: "preparedData", ctxKey: "preparedFile" }],
          ...pos(0, 0),
        },
        submit: {
          id: "submit",
          type: "activity",
          activityType: "azureOcr.submit",
          label: "Submit OCR",
          inputs: [{ port: "fileData", ctxKey: "preparedFile" }],
          ...pos(360, 180),
        },
      },
      edges: [{ id: "e1", source: "prep", target: "submit", type: "normal" }],
    };

    const wf = await createWorkflow(request, {
      name: config.metadata.name,
      config,
    });
    created.push(wf.id);

    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(wf.id, 2);

    await editor.selectNode("prep");
    await page.keyboard.press("Delete");

    // No confirmation dialog, and the toast names the blast radius rather than
    // leaving the author to discover it at save time.
    const toast = page.getByRole("alert");
    await expect(toast).toContainText("Deleted");
    await expect(toast).toContainText("Prepare File");
    await expect(toast).toContainText("variable lost its source");
    await expect(page.locator('.react-flow__node[data-id="prep"]')).toHaveCount(
      0,
    );

    // Undo restores the node AND the declaration it took with it.
    await page.getByTestId("undo-button").click();
    await expect(
      page.locator('.react-flow__node[data-id="prep"]'),
    ).toHaveCount(1);

    await editor.openMoreMenu();
    await editor.menuWorkflowSettings.click();
    await expect(page.getByTestId("ctx-references-preparedFile")).toBeVisible();
  });
});
