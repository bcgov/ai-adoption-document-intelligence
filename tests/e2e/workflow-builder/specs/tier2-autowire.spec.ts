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
 * surfaces two ways — the per-node status dot on the canvas
 * ([data-testid="node-status-dot"] data-status) and the "Inputs" section in the
 * settings panel ([data-testid="inputs-section"]).
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
    // auto-bound row: producer label + "auto" badge + Override.
    await expect(inputs.getByText("Prepare", { exact: true })).toBeVisible();
    await expect(inputs.getByText("auto", { exact: true })).toBeVisible();
    await expect(
      inputs.getByRole("button", { name: "Override" }),
    ).toBeVisible();
    // satisfied node → the "ok" status renders NO dot.
    await expect(
      page.locator(
        '.react-flow__node[data-id="submit"] [data-testid="node-status-dot"]',
      ),
    ).toHaveCount(0);
    expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });

  test("an unsatisfied input shows Needs source + a red status dot", async ({
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

    // Status dot renders per-node without selection.
    const dot = page.locator(
      '.react-flow__node[data-id="lone"] [data-testid="node-status-dot"]',
    );
    await expect(dot).toBeVisible();
    await expect(dot).toHaveAttribute("data-status", "unsatisfied");

    await editor.selectNode("lone");
    await expect(
      page.getByTestId("inputs-section").getByRole("button", {
        name: "Needs source",
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

    const dot = page.locator(
      '.react-flow__node[data-id="sink"] [data-testid="node-status-dot"]',
    );
    await expect(dot).toBeVisible();
    await expect(dot).toHaveAttribute("data-status", "ambiguous");

    await editor.selectNode("sink");
    await expect(
      page.getByTestId("inputs-section").getByRole("button", {
        name: "Choose source",
      }),
    ).toBeVisible();
  });

  test("Override locks the port and Revert restores auto", async ({
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
    // Override → pick the sole compatible producer in the modal.
    await inputs.getByRole("button", { name: "Override" }).click();
    const modal = page.getByRole("dialog");
    await expect(modal).toContainText("Choose source");
    await modal.getByTestId("producer-row-label").first().click();

    // Now locked: ctxKey shown, "locked" badge, "Revert to auto".
    await expect(inputs.getByText("locked", { exact: true })).toBeVisible();
    const revert = inputs.getByRole("button", { name: "Revert to auto" });
    await expect(revert).toBeVisible();
    await expect(inputs.getByRole("button", { name: "Override" })).toHaveCount(
      0,
    );

    // Revert → back to auto.
    await revert.click();
    await expect(
      inputs.getByRole("button", { name: "Override" }),
    ).toBeVisible();
    await expect(inputs.getByText("locked", { exact: true })).toHaveCount(0);
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
    await expect(inputs.getByText("locked", { exact: true })).toBeVisible();
    await expect(
      inputs.getByRole("button", { name: "Revert to auto" }),
    ).toBeVisible();
    expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });
});
