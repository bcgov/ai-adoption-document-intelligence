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
 *   - file.prepare               OUT[preparedData:Document]
 *   - document.normalizeOrientation OUT[correctedBlobKey:Document, …]
 *   - azureOcr.submit            IN[fileData:Document]
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
        label: "Normalize B",
        activityType: "document.normalizeOrientation",
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
    // auto-bound row: producer label + "Auto" badge + Change source.
    await expect(inputs.getByText("Prepare", { exact: true })).toBeVisible();
    await expect(inputs.getByText("Auto", { exact: true })).toBeVisible();
    await expect(
      inputs.getByRole("button", { name: "Change source" }),
    ).toBeVisible();
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
    // selects the node AND opens the source picker for that input — one click
    // to the exact fix.
    const badge = page.getByTestId("node-badge-sink");
    await expect(badge).toBeVisible();
    await badge.click();

    const picker = page.getByRole("dialog");
    await expect(picker).toBeVisible();
    // Both competing producers are offered to disambiguate.
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
    // Change source → pick the sole compatible producer in the modal.
    await inputs.getByRole("button", { name: "Change source" }).click();
    const modal = page.getByRole("dialog");
    await expect(modal).toContainText("Choose a source");
    await modal.getByTestId("producer-row-label").first().click();

    // Now locked: ctxKey shown, "Pinned" badge, "Revert to automatic".
    await expect(inputs.getByText("Pinned", { exact: true })).toBeVisible();
    const revert = inputs.getByRole("button", { name: "Revert to automatic" });
    await expect(revert).toBeVisible();
    await expect(
      inputs.getByRole("button", { name: "Change source" }),
    ).toHaveCount(0);

    // Revert → back to automatic.
    await revert.click();
    await expect(
      inputs.getByRole("button", { name: "Change source" }),
    ).toBeVisible();
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
    await expect(
      inputs.getByRole("button", { name: "Revert to automatic" }),
    ).toBeVisible();
    expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });
});
