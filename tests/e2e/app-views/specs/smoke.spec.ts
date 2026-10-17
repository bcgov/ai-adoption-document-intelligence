import { expect, test } from "@playwright/test";
import { setupAppTest } from "../helpers/app-test";

/**
 * App-wide smoke tests for the views outside the workflow-builder + benchmarking
 * areas. Each navigates with mock auth and asserts the view mounts its heading
 * without throwing a page error. These are deliberately shallow — their value is
 * catching shared-component / routing / auth regressions that crash a whole view
 * (deeper per-view behaviour lives in the dedicated specs).
 */
const VIEWS: Array<{ name: string; path: string; heading: RegExp }> = [
  { name: "Upload", path: "/", heading: /Upload documents/i },
  { name: "Processing queue", path: "/queue", heading: /Processing monitor/i },
  {
    name: "Template Models",
    path: "/template-models",
    heading: /Template Models/i,
  },
  { name: "Tables", path: "/tables", heading: /^Tables$/i },
  { name: "HITL Review", path: "/review", heading: /HITL Review Queue/i },
  { name: "Classify", path: "/classify", heading: /^Classify$/i },
  { name: "Settings", path: "/settings", heading: /^Settings$/i },
  { name: "Groups", path: "/groups", heading: /^Groups$/i },
];

test.describe("app views — smoke", () => {
  for (const view of VIEWS) {
    test(`${view.name} mounts and renders its heading`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (e) => pageErrors.push(e.message));

      await setupAppTest(page, { goto: view.path });

      await expect(
        page.getByRole("heading", { name: view.heading }),
      ).toBeVisible({ timeout: 15_000 });
      expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
    });
  }

  test("Dynamic nodes — new page mounts the editor", async ({ page }) => {
    // NOTE: no zero-page-error assertion here — the Monaco code editor's web
    // worker fails to initialise under headless Chromium (CDN/worker loading),
    // emitting an environmental "Event" error unrelated to the product. We just
    // assert the page + editor shell mount.
    await setupAppTest(page, { goto: "/dynamic-nodes/new" });

    await expect(page.getByTestId("dynamic-node-new-page")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("dynamic-node-editor")).toBeVisible();
    await expect(page.getByTestId("code-pane")).toBeVisible();
  });

  // NOTE: there is intentionally no unknown-route test here — the router has no
  // catch-all (`path: "*"`), so unknown paths fall through to React Router's
  // default error boundary rather than the app shell. Adding a NotFound route is
  // a possible future polish; until then there is no defined behaviour to assert.
});
