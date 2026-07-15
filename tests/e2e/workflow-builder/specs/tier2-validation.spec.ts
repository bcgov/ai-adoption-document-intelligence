import { expect, test } from "@playwright/test";
import { setupWorkflowBuilderTest } from "../helpers/wb-test";
import {
  buildLinearConfig,
  createWorkflow,
  deleteWorkflow,
  type GraphConfig,
} from "../helpers/workflow-api";
import { WorkflowEditorPage } from "../pages/WorkflowEditorPage";

/**
 * Tier 2 — validation surfacing (Manual test plan 5.4 + node-anchored 7.6).
 *
 * Validation is computed CLIENT-SIDE on the live config with a ~300ms debounce
 * (`useGraphValidation`) — no Save/publish round-trip is needed to see it. The
 * surfacing chain is: per-node canvas badge (`node-badge-<id>`, present only
 * when a node has ≥1 issue) → top-bar summary button → the Validation drawer
 * with a per-node entry (`validation-entry-<id>`) whose row carries the message
 * and the `nodes.<id>...` path that anchors it.
 *
 * Deterministic-on-load constraint: `POST /api/workflows` runs the SAME
 * validator server-side and REJECTS any error-severity config, so a persisted
 * fixture can only carry WARNING-severity issues. We use an unreachable node
 * (reachability check → warning, path `nodes.<id>`) — enough to prove the whole
 * surfacing + node-anchoring chain. Error-severity badges (red, with counts)
 * are unit-covered by `WorkflowEditorCanvas.test.tsx` (Scenario 5); driving the
 * UI into a persisted error state is intentionally out of scope here.
 */

/** buildLinearConfig + one orphan (edge-less) node → a reachability warning. */
function buildConfigWithUnreachableNode(name: string): GraphConfig {
  const config = buildLinearConfig({ name, withPositions: true });
  // Orphan must independently pass every error-severity check (registered
  // activityType, non-empty label, inputs bound to already-declared ctx keys)
  // AND leave no OTHER warning — every required input, including the
  // base-`Artifact` `documentId` identifier port (a warning when unbound
  // since identifier ports joined the problems surface), is bound to a
  // declared ctx key — so the ONLY issue is that no edge reaches it →
  // exactly one reachability warning, not error. `documentId` is declared
  // in `buildLinearConfig`'s ctx.
  config.nodes.orphan = {
    id: "orphan",
    type: "activity",
    label: "Orphan",
    activityType: "file.prepare",
    inputs: [
      { port: "blobKey", ctxKey: "blobKey" },
      { port: "fileName", ctxKey: "fileName" },
      { port: "documentId", ctxKey: "documentId" },
    ],
    metadata: { position: { x: 420, y: 340 } },
  };
  return config;
}

test.describe("validation surfacing", () => {
  let createdId: string | null = null;

  test.beforeEach(async ({ page }) => {
    await setupWorkflowBuilderTest(page);
  });

  test.afterEach(async ({ request }) => {
    if (createdId) {
      await deleteWorkflow(request, createdId);
      createdId = null;
    }
  });

  test("a valid workflow reports Valid with no node badges", async ({
    page,
    request,
  }, testInfo) => {
    const created = await createWorkflow(request, {
      name: `e2e validation-clean ${testInfo.testId}`,
      config: buildLinearConfig({ withPositions: true }),
    });
    createdId = created.id;

    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(created.id, 3);

    // The top-bar summary settles on "Valid" once the debounced validator runs.
    await expect(
      page.getByTestId("topbar-zone-right").getByRole("button", {
        name: "Valid",
      }),
    ).toBeVisible();
    // No node carries a validation badge (the element only exists on issues).
    await expect(page.locator('[data-testid^="node-badge-"]')).toHaveCount(0);
  });

  test("an unreachable node surfaces a warning badge that opens a node-anchored drawer entry", async ({
    page,
    request,
  }, testInfo) => {
    const created = await createWorkflow(request, {
      name: `e2e validation-warn ${testInfo.testId}`,
      config: buildConfigWithUnreachableNode(
        `e2e validation-warn ${testInfo.testId}`,
      ),
    });
    createdId = created.id;

    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(created.id, 4);

    // Per-node badge appears on the orphan with a single-issue count.
    const badge = page.getByTestId("node-badge-orphan");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText("1");

    // The top-bar summary button names it a WARNING (not an "issue"/error) —
    // asserting severity without brittle colour/inline-style checks. Scoped to
    // the top-bar zone because the node badge's aria-label also says "1 warning".
    await expect(
      page.getByTestId("topbar-zone-right").getByRole("button", {
        name: "1 warning",
      }),
    ).toBeVisible();

    // Clicking the badge opens the Validation drawer focused on that node.
    await badge.click();
    const drawer = page.getByRole("dialog", { name: "Validation" });
    await expect(drawer).toBeVisible();

    // The drawer's per-node entry carries the reachability message + the
    // `nodes.<id>` path that anchors the issue to the offending node.
    const entry = drawer.getByTestId("validation-entry-orphan");
    await expect(entry).toBeVisible();
    await expect(entry).toContainText(/not reachable/i);
    await expect(entry).toContainText("nodes.orphan");
  });
});
