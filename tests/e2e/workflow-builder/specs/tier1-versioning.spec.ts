import { expect, test } from "@playwright/test";
import { setupWorkflowBuilderTest } from "../helpers/wb-test";
import {
  buildLinearConfig,
  createWorkflow,
  deleteWorkflow,
  updateWorkflow,
} from "../helpers/workflow-api";
import { WorkflowEditorPage } from "../pages/WorkflowEditorPage";

/**
 * Tier 1 — version history drawer + compare.
 *
 * We publish two versions via the API (create = v1, PUT = v2), then open the
 * history drawer and assert both versions render with the head badge on the
 * latest, and that Compare opens the diff modal.
 */
test.describe("version history", () => {
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

  test("two published versions appear with a head badge; compare opens", async ({
    page,
    request,
  }) => {
    const created = await createWorkflow(request, {
      name: "e2e versioned",
      config: buildLinearConfig({ name: "v1", withPositions: true }),
    });
    createdId = created.id;
    await updateWorkflow(request, created.id, {
      name: "e2e versioned",
      config: buildLinearConfig({ name: "v2", withPositions: true }),
    });

    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(created.id, 3);
    await editor.openHistory();

    const list = page.getByTestId("history-drawer-list");
    await expect(list).toBeVisible();

    // Each version is a `history-row-<id>` card; the revert/compare/run-count
    // testids are nested children, so count only the card wrappers.
    const versionCards = page.locator(
      '[data-testid^="history-row-"]:not([data-testid*="revert"])' +
        ':not([data-testid*="compare"]):not([data-testid*="run-count"])' +
        ':not([data-testid="history-row-head-badge"])',
    );
    await expect.poll(() => versionCards.count()).toBeGreaterThanOrEqual(2);
    await expect(page.getByTestId("history-row-head-badge")).toHaveCount(1);

    // Compare the (older) non-head version against head. The Mantine modal
    // root stays in the DOM hidden; assert its body content instead.
    await page.locator('[data-testid^="history-row-compare-"]').last().click();
    await expect(page.getByTestId("compare-left-column")).toBeVisible();
  });
});
