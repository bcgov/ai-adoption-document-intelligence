import { expect, test } from "@playwright/test";
import { setupWorkflowBuilderTest } from "../helpers/wb-test";
import {
  createWorkflow,
  deleteWorkflow,
  type GraphConfig,
} from "../helpers/workflow-api";
import { WorkflowEditorPage } from "../pages/WorkflowEditorPage";

/**
 * Tier 2 — auto-wire (Manual test plan Part 8).
 *
 * The resolver hides port bindings behind the wire: a typed input with a
 * single upstream producer of its kind auto-binds; two equidistant producers
 * are ambiguous; none is unsatisfied; a hand-authored binding is locked. State
 * surfaces two ways — the per-node unified problems badge on the canvas
 * ([data-testid="node-badge-<id>"], into which auto-wire issues now fold) and
 * the "Inputs" section in the settings panel ([data-testid="inputs-section"]).
 *
 * Typed catalog kinds used (from /api/activity-catalog):
 *   - file.prepare               OUT[preparedData:PreparedFile]
 *   - azureOcr.submit            IN[fileData:PreparedFile]
 *
 * The ambiguity fixture uses two file.prepare producers because PreparedFile
 * is the only shape azureOcr.submit's fileData accepts — after the kind
 * taxonomy refinement, a DocumentRef producer (e.g. normalizeOrientation's
 * blob key) is correctly NOT a competing source for a PreparedFile input.
 */

const pos = (x: number, y: number) => ({ metadata: { position: { x, y } } });

/** prep --Document--> submit (auto-bind), plus a lone submit (unsatisfied). */
function buildAutoWireConfig(): GraphConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "e2e autowire" },
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
        ...pos(420, 120),
      },
      lone: {
        id: "lone",
        type: "activity",
        label: "Lone Submit",
        activityType: "azureOcr.submit",
        ...pos(420, 360),
      },
    },
    edges: [{ id: "e1", source: "prep", target: "submit", type: "normal" }],
  };
}

/** Two Document producers feeding one consumer → ambiguous fileData. */
function buildAmbiguousConfig(): GraphConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "e2e autowire ambiguous" },
    entryNodeId: "prepA",
    ctx: { blobKey: { type: "string" } },
    nodes: {
      prepA: {
        id: "prepA",
        type: "activity",
        label: "Prepare A",
        activityType: "file.prepare",
        inputs: [{ port: "blobKey", ctxKey: "blobKey" }],
        ...pos(80, 80),
      },
      normB: {
        id: "normB",
        type: "activity",
        label: "Prepare B",
        activityType: "file.prepare",
        inputs: [{ port: "blobKey", ctxKey: "blobKey" }],
        ...pos(80, 320),
      },
      sink: {
        id: "sink",
        type: "activity",
        label: "Submit OCR",
        activityType: "azureOcr.submit",
        ...pos(460, 200),
      },
    },
    edges: [
      { id: "a", source: "prepA", target: "sink", type: "normal" },
      { id: "b", source: "normB", target: "sink", type: "normal" },
    ],
  };
}

/** A hand-authored (locked) fileData binding that the resolver must preserve. */
function buildLockedConfig(): GraphConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "e2e autowire locked" },
    entryNodeId: "prep",
    ctx: { blobKey: { type: "string" }, manualDoc: { type: "object" } },
    nodes: {
      prep: {
        id: "prep",
        type: "activity",
        label: "Prepare",
        activityType: "file.prepare",
        inputs: [{ port: "blobKey", ctxKey: "blobKey" }],
        outputs: [{ port: "preparedData", ctxKey: "manualDoc" }],
        ...pos(80, 120),
      },
      submit: {
        id: "submit",
        type: "activity",
        label: "Submit OCR",
        activityType: "azureOcr.submit",
        inputs: [{ port: "fileData", ctxKey: "manualDoc" }],
        metadata: {
          position: { x: 420, y: 120 },
          lockedInputPorts: ["fileData"],
        },
      },
    },
    edges: [{ id: "e1", source: "prep", target: "submit", type: "normal" }],
  };
}

test.describe("auto-wire", () => {
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

  test("auto-binds a typed input from an upstream producer (no status dot)", async ({
    page,
    request,
  }) => {
    createdId = (
      await createWorkflow(request, {
        name: `e2e autowire ${test.info().testId}`,
        config: buildAutoWireConfig(),
      })
    ).id;
    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(createdId, 3);
    await editor.selectNode("submit");

    const inputs = page.getByTestId("inputs-section");
    await expect(inputs).toBeVisible();
    // auto-bound row: producer label + "Auto" badge; "Change source" is a
    // secondary action behind the row's ⋯ menu.
    await expect(inputs.getByText("Prepare", { exact: true })).toBeVisible();
    await expect(inputs.getByText("Auto", { exact: true })).toBeVisible();
    await inputs.getByTestId("input-row-menu-fileData").click();
    await expect(
      page.getByTestId("input-row-menu-fileData-change"),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    // satisfied node → NO problems badge (auto-wire issues fold into the same
    // per-node validation badge, which only renders when something's wrong).
    await expect(page.getByTestId("node-badge-submit")).toHaveCount(0);
    expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });

  test("an unsatisfied input shows Needs a source + a problems badge", async ({
    page,
    request,
  }) => {
    createdId = (
      await createWorkflow(request, {
        name: `e2e autowire ${test.info().testId}`,
        config: buildAutoWireConfig(),
      })
    ).id;
    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(createdId, 3);

    // The unbound input folds into the node's unified problems badge
    // (top-left) — no separate status dot anymore.
    await expect(page.getByTestId("node-badge-lone")).toBeVisible();

    await editor.selectNode("lone");
    await expect(
      page.getByTestId("inputs-section").getByRole("button", {
        name: "Needs a source",
      }),
    ).toBeVisible();
  });

  test("two equidistant producers make the input ambiguous", async ({
    page,
    request,
  }) => {
    createdId = (
      await createWorkflow(request, {
        name: `e2e autowire ambiguous ${test.info().testId}`,
        config: buildAmbiguousConfig(),
      })
    ).id;
    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(createdId, 3);

    await expect(page.getByTestId("node-badge-sink")).toBeVisible();

    await editor.selectNode("sink");
    await expect(
      page.getByTestId("inputs-section").getByRole("button", {
        name: "Pick a source",
      }),
    ).toBeVisible();
  });

  test("clicking a node's problems badge deep-links to the offending input's picker", async ({
    page,
    request,
  }) => {
    createdId = (
      await createWorkflow(request, {
        name: `e2e autowire badge-fix ${test.info().testId}`,
        config: buildAmbiguousConfig(),
      })
    ).id;
    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(createdId, 3);

    // The ambiguous input surfaces on the unified problems badge; clicking it
    // opens the node-scoped Validation drawer, whose input row deep-links to
    // the source picker — one click to the exact fix.
    const badge = page.getByTestId("node-badge-sink");
    await expect(badge).toBeVisible();
    // The badge sits inside the transformed React-Flow node; in headless the
    // node/pane overlay intercepts a positional click, so dispatch the click
    // straight to the badge to exercise its deep-link handler.
    await badge.dispatchEvent("click");

    // Node-scoped drawer titled "Problems on <label>" (the global drawer is
    // titled "Validation"); it lists the ambiguous `fileData` input.
    const drawer = page.getByRole("dialog", { name: /Problems on Submit OCR/ });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByTestId("validation-entry-sink")).toBeVisible();
    // The input row carries the "Pick a source →" deep-link fix.
    await drawer.getByText("Pick a source →").click();

    // The source picker opens for that input, offering both competing producers.
    const picker = page
      .getByRole("dialog")
      .filter({ hasText: "Choose a source" });
    await expect(picker.getByTestId("producer-row-label")).toHaveCount(2);
  });

  test("Change source locks the port and Revert restores automatic", async ({
    page,
    request,
  }) => {
    createdId = (
      await createWorkflow(request, {
        name: `e2e autowire ${test.info().testId}`,
        config: buildAutoWireConfig(),
      })
    ).id;
    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(createdId, 3);
    await editor.selectNode("submit");

    const inputs = page.getByTestId("inputs-section");
    // Change source (behind the auto-bound row's ⋯ menu) → pick the sole
    // compatible producer in the modal.
    await inputs.getByTestId("input-row-menu-fileData").click();
    await page.getByTestId("input-row-menu-fileData-change").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toContainText("Choose a source");
    await modal.getByTestId("producer-row-label").first().click();

    // Now locked: "Pinned" badge. The ⋯ menu offers both Change source and
    // Revert to automatic.
    await expect(inputs.getByText("Pinned", { exact: true })).toBeVisible();
    await inputs.getByTestId("input-row-menu-fileData").click();
    await expect(
      page.getByTestId("input-row-menu-fileData-change"),
    ).toBeVisible();
    // Revert → back to automatic.
    await page.getByTestId("input-row-menu-fileData-revert").click();
    await expect(inputs.getByText("Auto", { exact: true })).toBeVisible();
    await expect(inputs.getByText("Pinned", { exact: true })).toHaveCount(0);
    expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });

  test("a hand-authored locked binding is preserved on load", async ({
    page,
    request,
  }) => {
    createdId = (
      await createWorkflow(request, {
        name: `e2e autowire locked ${test.info().testId}`,
        config: buildLockedConfig(),
      })
    ).id;
    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(createdId, 2);
    await editor.selectNode("submit");

    const inputs = page.getByTestId("inputs-section");
    // Locked binding surfaces its ctx key verbatim (not rewritten to __auto.*).
    await expect(inputs.getByText("manualDoc")).toBeVisible();
    await expect(inputs.getByText("Pinned", { exact: true })).toBeVisible();
    // "Revert to automatic" is behind the locked row's ⋯ menu.
    await inputs.getByTestId("input-row-menu-fileData").click();
    await expect(
      page.getByTestId("input-row-menu-fileData-revert"),
    ).toBeVisible();
    expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });
});
