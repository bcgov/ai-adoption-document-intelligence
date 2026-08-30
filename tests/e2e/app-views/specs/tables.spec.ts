import { expect, test } from "@playwright/test";
import { setupAppTest } from "../helpers/app-test";

/**
 * App views — Tables (reference data).
 *
 * Uses the seeded `payment_schedule` table (created by `db:seed`) so the test is
 * deterministic and side-effect-free. The Tables pages currently carry no
 * data-testids, so we navigate by visible text — stable enough for a list →
 * detail smoke of a known seed row.
 */
const SEED_TABLE_LABEL = "Payment Schedule (BC Income Assistance)";

test.describe("tables page", () => {
  test("the list shows the seeded reference table", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    await setupAppTest(page, { goto: "/tables" });

    await expect(
      page.getByRole("heading", { name: /^Tables$/i }),
    ).toBeVisible();
    await expect(page.getByText(SEED_TABLE_LABEL)).toBeVisible({
      timeout: 15_000,
    });
    expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });

  test("opening a table shows its detail with the Rows tab", async ({
    page,
  }) => {
    await setupAppTest(page, { goto: "/tables" });

    await page.getByText(SEED_TABLE_LABEL).click();

    // Detail route + the table label rendered on the detail page.
    await expect(page).toHaveURL(/\/tables\/[^/]+$/, { timeout: 15_000 });
    await expect(page.getByText(SEED_TABLE_LABEL).first()).toBeVisible();
    await expect(page.getByRole("tab", { name: /Rows/i })).toBeVisible();
  });
});
