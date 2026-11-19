import { expect, test } from "@playwright/test";
import { setupAppTest } from "../helpers/app-test";

/**
 * App views — Groups.
 *
 * The Groups page has the richest testid coverage in the app. Group mutations
 * require real platform-admin JWT auth (the test API key is rejected with 401),
 * so we exercise the admin-only create-group MODAL UI without committing a
 * mutation — open, field presence, client-side validation, cancel.
 */
test.describe("groups page", () => {
  test("renders the heading and admin create-group affordance", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    await setupAppTest(page, { isAdmin: true, goto: "/groups" });

    await expect(
      page.getByRole("heading", { name: /^Groups$/i }),
    ).toBeVisible();
    await expect(page.getByTestId("create-group-btn")).toBeVisible();
    expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });

  test("the create-group modal opens with its fields and cancels cleanly", async ({
    page,
  }) => {
    await setupAppTest(page, { isAdmin: true, goto: "/groups" });

    await page.getByTestId("create-group-btn").click();
    await expect(page.getByTestId("create-group-name")).toBeVisible();
    await expect(page.getByTestId("create-group-description")).toBeVisible();
    await expect(page.getByTestId("create-group-submit-btn")).toBeVisible();

    await page.getByTestId("create-group-cancel-btn").click();
    await expect(page.getByTestId("create-group-name")).toBeHidden();
  });

  test("submitting an empty name surfaces a validation error", async ({
    page,
  }) => {
    await setupAppTest(page, { isAdmin: true, goto: "/groups" });

    await page.getByTestId("create-group-btn").click();
    await expect(page.getByTestId("create-group-name")).toBeVisible();
    // Submit with no name — Mantine form validation blocks the submit and
    // surfaces an inline field error (no POST, so no backend permission needed).
    await page.getByTestId("create-group-submit-btn").click();
    await expect(page.getByText("Name is required")).toBeVisible();
    // The modal stays open on a validation failure.
    await expect(page.getByTestId("create-group-name")).toBeVisible();
  });
});
