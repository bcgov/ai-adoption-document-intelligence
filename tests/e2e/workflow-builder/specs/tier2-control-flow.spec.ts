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
 * Tier 2 — control-flow authoring (Manual test plan Part 4).
 *
 * The six control-flow nodes each have a hand-rolled settings form whose job is
 * to serialize → save → reload without corrupting the graph. That round-trip is
 * exactly what unit tests miss and e2e catches, so this suite drives the real
 * forms: it asserts each form renders its saved values, that the NodePicker /
 * EdgePicker constraints hold (join lists only map nodes; a switch case offers
 * only conditional edges), that the recursive condition editor deserializes a
 * 3-level nested expression, and that an edit round-trips through Save + reload.
 *
 * Deterministic (design-time only) — no Temporal, default CI tier.
 */

/** One valid graph containing all six control-flow node types. */
function buildControlFlowConfig(name: string): GraphConfig {
  const pos = (x: number, y: number) => ({ metadata: { position: { x, y } } });
  const inlineChild: GraphConfig = {
    schemaVersion: "1.0",
    metadata: { name: "Inline child" },
    entryNodeId: "c1",
    ctx: { blobKey: { type: "string" } },
    nodes: {
      c1: {
        id: "c1",
        type: "activity",
        label: "Prepare (inline)",
        activityType: "file.prepare",
        inputs: [{ port: "blobKey", ctxKey: "blobKey" }],
      },
    },
    edges: [],
  };
  return {
    schemaVersion: "1.0",
    metadata: { name },
    entryNodeId: "routeByType",
    ctx: {
      documents: { type: "array" },
      currentDoc: { type: "object" },
      ocrResult: { type: "object" },
      results: { type: "array" },
      item: { type: "object" },
    },
    nodes: {
      // The map + its 2-node body are isolated bottom-right so the synthetic
      // map-body container never overlaps the free-standing nodes above (which
      // must stay cleanly clickable). Every other control-flow node is
      // free-standing — join still references this map via sourceMapNodeId.
      eachDoc: {
        id: "eachDoc",
        type: "map",
        label: "Run for each document",
        collectionCtxKey: "documents",
        itemCtxKey: "item",
        indexCtxKey: "docIndex",
        maxConcurrency: 5,
        bodyEntryNodeId: "bodyIn",
        bodyExitNodeId: "bodyOut",
        ...pos(440, 640),
      },
      bodyIn: {
        id: "bodyIn",
        type: "activity",
        label: "Body In",
        activityType: "file.prepare",
        ...pos(720, 640),
      },
      bodyOut: {
        id: "bodyOut",
        type: "activity",
        label: "Body Out",
        activityType: "ocr.cleanup",
        ...pos(980, 640),
      },
      routeByType: {
        id: "routeByType",
        type: "switch",
        label: "Branch by condition",
        cases: [
          {
            condition: {
              operator: "equals",
              left: { ref: "ctx.currentDoc.type" },
              right: { literal: "invoice" },
            },
            edgeId: "route-invoice",
          },
          {
            // AND( OR( EQ, GTE ), NOT( IS-NULL ) ) — 3 levels deep.
            condition: {
              operator: "and",
              operands: [
                {
                  operator: "or",
                  operands: [
                    {
                      operator: "equals",
                      left: { ref: "ctx.currentDoc.type" },
                      right: { literal: "receipt" },
                    },
                    {
                      operator: "gte",
                      left: { ref: "ctx.currentDoc.confidence" },
                      right: { literal: 0.8 },
                    },
                  ],
                },
                {
                  operator: "not",
                  operand: {
                    operator: "is-null",
                    value: { ref: "ctx.currentDoc.blobKey" },
                  },
                },
              ],
            },
            edgeId: "route-receipt",
          },
        ],
        defaultEdge: "route-default",
        ...pos(440, 100),
      },
      childOcr: {
        id: "childOcr",
        type: "childWorkflow",
        label: "Sub-workflow (inline OCR)",
        workflowRef: { type: "inline", graph: inlineChild },
        inputMappings: [{ port: "blobKey", ctxKey: "currentDoc.blobKey" }],
        outputMappings: [{ port: "preparedData", ctxKey: "ocrResult" }],
        ...pos(820, 100),
      },
      pollOcr: {
        id: "pollOcr",
        type: "pollUntil",
        label: "Wait until condition",
        activityType: "azureOcr.poll",
        condition: {
          operator: "not-equals",
          left: { ref: "ctx.ocrResult.status" },
          right: { literal: "running" },
        },
        interval: "10s",
        maxAttempts: 20,
        initialDelay: "5s",
        timeout: "10m",
        ...pos(440, 280),
      },
      approve: {
        id: "approve",
        type: "humanGate",
        label: "Wait for approval",
        signal: {
          name: "humanApproval",
          payloadSchema: { approved: "boolean", reviewer: "string" },
        },
        timeout: "24h",
        onTimeout: "fail",
        ...pos(820, 280),
      },
      collect: {
        id: "collect",
        type: "join",
        label: "Collect results",
        sourceMapNodeId: "eachDoc",
        strategy: "all",
        resultsCtxKey: "results",
        ...pos(440, 460),
      },
      store: {
        id: "store",
        type: "activity",
        label: "Store Results",
        activityType: "ocr.storeResults",
        ...pos(820, 460),
      },
    },
    edges: [
      { id: "body-edge", source: "bodyIn", target: "bodyOut", type: "normal" },
      { id: "map-join", source: "eachDoc", target: "collect", type: "normal" },
      { id: "join-store", source: "collect", target: "store", type: "normal" },
      {
        id: "route-invoice",
        source: "routeByType",
        target: "childOcr",
        type: "conditional",
        condition: "invoice",
      },
      {
        id: "route-receipt",
        source: "routeByType",
        target: "pollOcr",
        type: "conditional",
        condition: "receipt",
      },
      {
        id: "route-default",
        source: "routeByType",
        target: "approve",
        type: "conditional",
        condition: "default",
      },
    ],
  };
}

test.describe("control-flow authoring", () => {
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

  async function openGraph(
    page: import("@playwright/test").Page,
    request: import("@playwright/test").APIRequestContext,
  ) {
    createdId = (
      await createWorkflow(request, {
        name: `e2e control-flow ${test.info().testId}`,
        config: buildControlFlowConfig(
          `e2e control-flow ${test.info().testId}`,
        ),
      })
    ).id;
    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(createdId, 9);
    return editor;
  }

  test("4.1–4.6 — every control-flow node renders its settings form with saved values", async ({
    page,
    request,
  }) => {
    const editor = await openGraph(page, request);

    // map (Mantine puts data-testid on the <input> itself)
    await editor.selectNode("eachDoc");
    await expect(page.getByTestId("map-node-settings")).toBeVisible();
    await expect(
      page.getByTestId("map-node-settings-max-concurrency"),
    ).toHaveValue("5");

    // switch
    await editor.selectNode("routeByType");
    await expect(page.getByTestId("switch-node-settings")).toBeVisible();
    await expect(page.getByTestId("switch-node-settings-case-0")).toBeVisible();
    await expect(
      page.getByTestId("switch-node-settings-default-edge"),
    ).toBeVisible();

    // join — no strategy control exists (schema fixes it to "all")
    await editor.selectNode("collect");
    await expect(page.getByTestId("join-node-settings")).toBeVisible();
    await expect(
      page.getByTestId("join-node-settings-source-map-node-id"),
    ).toBeVisible();

    // pollUntil
    await editor.selectNode("pollOcr");
    await expect(page.getByTestId("poll-until-node-settings")).toBeVisible();
    await expect(
      page.getByTestId("poll-until-node-settings-interval"),
    ).toHaveValue("10s");

    // humanGate — onTimeout=fail, so no fallback-edge picker
    await editor.selectNode("approve");
    await expect(page.getByTestId("human-gate-node-settings")).toBeVisible();
    await expect(
      page.getByTestId("human-gate-node-settings-signal-name"),
    ).toHaveValue("humanApproval");
    await expect(
      page.getByTestId("human-gate-node-settings-fallback-edge"),
    ).toHaveCount(0);

    // childWorkflow — inline variant
    await editor.selectNode("childOcr");
    await expect(
      page.getByTestId("child-workflow-node-settings"),
    ).toBeVisible();
    await expect(
      page.getByTestId("child-workflow-node-settings-inline-body"),
    ).toBeVisible();

    expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });

  test("4.3 — join's source-map picker lists only map nodes", async ({
    page,
    request,
  }) => {
    const editor = await openGraph(page, request);
    await editor.selectNode("collect");

    await page.getByTestId("join-node-settings-source-map-node-id").click();
    // The one map node is offered…
    await expect(
      page.getByRole("option", { name: /Run for each document/ }),
    ).toBeVisible();
    // …activity / non-map nodes are genuinely absent (not just disabled).
    await expect(
      page.getByRole("option", { name: /Store Results/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("option", { name: /Sub-workflow/ }),
    ).toHaveCount(0);
  });

  test("4.1 — a switch case's edge picker is scoped to that switch's conditional edges", async ({
    page,
    request,
  }) => {
    const editor = await openGraph(page, request);
    await editor.selectNode("routeByType");

    await page.getByTestId("switch-node-settings-case-0-edge").click();
    // The switch's conditional edges are offered (option secondary text = id).
    await expect(
      page.getByRole("option", { name: /route-invoice/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("option", { name: /route-receipt/ }),
    ).toBeVisible();
    // A normal edge (from a different source) is not — scoped by source + type.
    await expect(page.getByRole("option", { name: /map-join/ })).toHaveCount(0);
  });

  test("4.7 — the recursive condition editor renders a 3-level nested expression", async ({
    page,
    request,
  }) => {
    const editor = await openGraph(page, request);
    await editor.selectNode("routeByType");

    // Case 1 holds AND( OR(EQ,GTE), NOT(IS-NULL) ). Testids nest by operand.
    const t = "switch-node-settings-case-1-condition";
    await expect(page.getByTestId(`${t}-body-logical`)).toHaveAttribute(
      "data-operator",
      "and",
    );
    // Level 2: first operand is a logical OR.
    await expect(
      page.getByTestId(`${t}-operand-0-editor-body-logical`),
    ).toHaveAttribute("data-operator", "or");
    // Level 2: second operand is a NOT wrapping a null-check (level 3).
    await expect(
      page.getByTestId(`${t}-operand-1-editor-body-not`),
    ).toBeVisible();
    await expect(
      page.getByTestId(
        `${t}-operand-1-editor-not-operand-editor-body-null-check`,
      ),
    ).toBeVisible();

    expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });

  test("4.6 — switching humanGate onTimeout to Fallback reveals the fallback-edge picker", async ({
    page,
    request,
  }) => {
    const editor = await openGraph(page, request);
    await editor.selectNode("approve");

    // Starts at "fail": no fallback-edge control.
    await expect(
      page.getByTestId("human-gate-node-settings-fallback-edge"),
    ).toHaveCount(0);

    // Click the "Fallback" segment of the onTimeout SegmentedControl.
    await page
      .getByTestId("human-gate-node-settings-on-timeout")
      .getByText("Fallback", { exact: true })
      .click();

    await expect(
      page.getByTestId("human-gate-node-settings-fallback-edge"),
    ).toBeVisible();
  });

  test("pollUntil maxAttempts edit round-trips through Save + reload", async ({
    page,
    request,
  }) => {
    const editor = await openGraph(page, request);
    await editor.selectNode("pollOcr");

    const input = page.getByTestId("poll-until-node-settings-max-attempts");
    await expect(input).toHaveValue("20");
    await input.fill("8");
    // Blur so the NumberInput commits, then save.
    await page.keyboard.press("Tab");
    await editor.saveButton.click();

    // Persisted server-side.
    await expect
      .poll(async () => {
        const wf = await getWorkflow(request, createdId as string);
        return wf.config.nodes.pollOcr.maxAttempts;
      })
      .toBe(8);

    // And survives a reload into the form.
    await editor.openExisting(createdId as string, 9);
    await editor.selectNode("pollOcr");
    await expect(
      page.getByTestId("poll-until-node-settings-max-attempts"),
    ).toHaveValue("8");

    expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });
});

test.describe("control-flow authoring — map form round-trip", () => {
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

  test("4.2 — the map form shows every saved field and a maxConcurrency edit round-trips", async ({
    page,
    request,
  }) => {
    createdId = (
      await createWorkflow(request, {
        name: `e2e map-form ${test.info().testId}`,
        config: buildControlFlowConfig(`e2e map-form ${test.info().testId}`),
      })
    ).id;
    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(createdId, 9);
    await editor.selectNode("eachDoc");

    // Full form: iteration keys, concurrency, and both body pickers carry
    // the saved values (the render test only spot-checks concurrency).
    await expect(
      page.getByTestId("map-node-settings-collection-ctx-key"),
    ).toHaveValue("documents");
    await expect(
      page.getByTestId("map-node-settings-item-ctx-key"),
    ).toHaveValue("item");
    await expect(
      page.getByTestId("map-node-settings-index-ctx-key"),
    ).toHaveValue("docIndex");
    await expect(
      page.getByTestId("map-node-settings-body-entry"),
    ).toHaveValue(/Body In/);
    await expect(page.getByTestId("map-node-settings-body-exit")).toHaveValue(
      /Body Out/,
    );

    // Edit maxConcurrency through the map's own serializer (distinct from the
    // pollUntil round-trip — different form + node-type serialize path).
    const input = page.getByTestId("map-node-settings-max-concurrency");
    await expect(input).toHaveValue("5");
    await input.fill("3");
    await page.keyboard.press("Tab");
    await editor.saveButton.click();

    await expect
      .poll(async () => {
        const wf = await getWorkflow(request, createdId as string);
        return wf.config.nodes.eachDoc.maxConcurrency;
      })
      .toBe(3);

    // Survives a reload into the form.
    await editor.openExisting(createdId, 9);
    await editor.selectNode("eachDoc");
    await expect(
      page.getByTestId("map-node-settings-max-concurrency"),
    ).toHaveValue("3");

    expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });
});
