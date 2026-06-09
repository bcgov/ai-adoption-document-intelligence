import { Page } from "@playwright/test";

/**
 * Shared setup for the workflow-builder Playwright suite.
 *
 * Why this exists instead of reusing tests/e2e/helpers/auth.ts directly:
 * the axios layer talks to the backend at :3002 (CORS), but the agent chat
 * drawer + conversation endpoints use RELATIVE paths (`/api/agent/...`) that
 * the browser sends to the frontend origin (:3000) and Vite proxies to :3002.
 * Intercepting only `:3002/**` therefore misses the agent traffic. We use
 * origin-agnostic `**​/api/**` globs (the same pattern the phase walkthroughs
 * used) so both routings are covered.
 */

export const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3002";
export const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
// playwright.config.ts (and the validation config) default this env var to the
// local seed key before any test runs, so reading from env here is sufficient —
// no need to duplicate the literal (which also keeps the secret-scanner happy).
export const TEST_API_KEY = process.env.TEST_API_KEY ?? "";

/** The seed group every seeded workflow + the mock user belong to. */
export const SEED_GROUP_ID = "seeddefaultgroup";

/** Stable ids created by `prisma db seed` (see global-setup DB reset). */
export const SEED_WORKFLOW_IDS = {
  standardOcr: "seed-workflow-standard-ocr",
  standardOcrMistral: "seed-workflow-standard-ocr-mistral",
  multiPageReport: "seed-workflow-multi-page-report",
} as const;

const MOCK_PROFILE = {
  sub: "test-user",
  name: "Test User",
  preferred_username: "testuser",
  email: "test@example.com",
  roles: ["user"],
  isAdmin: false,
  expires_in: 3600,
  groups: [{ id: SEED_GROUP_ID, name: "Default" }],
};

/**
 * Intercepts all backend traffic to inject the API key and mock the auth
 * session, then navigates to the app. Origin-agnostic so it covers both the
 * direct (:3002) axios calls and the proxied (:3000) agent calls.
 *
 * Register order matters: the broad `**​/api/**` continue-handler goes first,
 * then the specific `/api/auth/*` fulfil-handlers, because Playwright gives the
 * most-recently-registered matching route priority.
 */
export async function setupWorkflowBuilderTest(page: Page): Promise<void> {
  await page.route("**/api/**", async (route, request) => {
    const headers = { ...request.headers(), "x-api-key": TEST_API_KEY };
    delete headers["authorization"];
    await route.continue({ headers });
  });

  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_PROFILE),
    });
  });

  await page.route("**/api/auth/refresh", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ expires_in: 3600 }),
    });
  });

  await page.goto(FRONTEND_URL);
  await page.waitForLoadState("networkidle");
}
