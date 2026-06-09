import { expect, test } from "@playwright/test";
import {
  deleteDynamicNode,
  publishDynamicNode,
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
    // Unique per run: a dynamic-node slug stays reserved after (soft) delete, so
    // a fixed name would 409 on the second run against a non-reset DB.
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
});
