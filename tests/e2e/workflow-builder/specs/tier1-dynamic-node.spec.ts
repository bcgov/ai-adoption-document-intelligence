import { expect, test } from "@playwright/test";
import {
  attemptPublishScript,
  deleteDynamicNode,
  publishDynamicNode,
  validDynamicNodeScript,
} from "../helpers/dynamic-node-api";
import { FRONTEND_URL, setupWorkflowBuilderTest } from "../helpers/wb-test";

/**
 * Tier 1 (UI) + @infra (lifecycle) — the dynamic-node editor surface.
 *
 * The list page is pure UI (default CI). Publishing a node runs the Deno
 * toolchain via the deno-runner sidecar, so the seed-and-edit lifecycle test is
 * tagged @infra.
 */
test.describe("dynamic nodes — list & editor", () => {
  test.beforeEach(async ({ page }) => {
    await setupWorkflowBuilderTest(page);
  });

  test("the list page renders with a New button", async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/dynamic-nodes`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("dynamic-nodes-list-new-btn")).toBeVisible();
  });

  test("a published node appears in the list and opens in the editor", {
    tag: "@infra",
  }, async ({ page, request }) => {
    // Unique per run so parallel workers / re-runs against a non-reset DB don't
    // collide on a live lineage (a deleted slug now restores rather than 409s —
    // see the restore test below).
    const name = `e2e-dyn-${Date.now()}`;
    const { slug } = await publishDynamicNode(request, name);
    try {
      await page.goto(`${FRONTEND_URL}/dynamic-nodes`);
      await page.waitForLoadState("networkidle");

      const row = page.getByTestId(`dynamic-nodes-list-row-${slug}`);
      await expect(row).toBeVisible();

      // Open the editor and assert the signature preview rendered.
      await page.getByTestId(`dynamic-nodes-list-edit-${slug}`).click();
      await expect(page.getByTestId("dynamic-node-editor")).toBeVisible();
      await expect(page.getByTestId("signature-preview-card")).toBeVisible();
      await expect(page.getByTestId("code-pane")).toBeVisible();
    } finally {
      await deleteDynamicNode(request, slug);
    }
  });

  test("14.x — re-publishing a deleted node restores it under the same slug; a live collision still 409s", {
    tag: "@infra",
  }, async ({ request }) => {
    const name = `e2e-dyn-restore-${Date.now()}`;
    // v1, then soft-delete (the slug used to be reserved forever).
    const first = await publishDynamicNode(request, name);
    expect(first.version).toBe(1);
    await deleteDynamicNode(request, name);

    // Re-publishing the SAME name now RESTORES the lineage (no 409) and
    // continues its version history rather than starting a new v1.
    const restored = await publishDynamicNode(request, name);
    try {
      expect(restored.version).toBe(2);

      // The lineage is live again → a further POST of the same name is a
      // genuine duplicate and must still 409.
      const collision = await attemptPublishScript(
        request,
        validDynamicNodeScript(name),
      );
      expect(collision.status).toBe(409);
    } finally {
      await deleteDynamicNode(request, name);
    }
  });
});
