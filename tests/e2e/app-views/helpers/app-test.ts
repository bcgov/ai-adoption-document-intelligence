import { Page } from "@playwright/test";

/**
 * Shared auth/setup for the app-views E2E suite (views outside the
 * workflow-builder + benchmarking areas). Mirrors the origin-agnostic auth used
 * by the workflow-builder suite so it covers both the direct (:3002) axios
 * calls and any proxied (:3000) calls.
 */

export const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3002";
export const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
export const TEST_API_KEY = process.env.TEST_API_KEY ?? "";
export const SEED_GROUP_ID = "seeddefaultgroup";

interface SetupOptions {
  /** Mark the mock user as a platform admin (unlocks admin-only affordances). */
  isAdmin?: boolean;
  /** Navigate to this path after auth is wired (default: app root). */
  goto?: string;
}

export async function setupAppTest(
  page: Page,
  opts: SetupOptions = {},
): Promise<void> {
  await page.route("**/api/**", async (route, request) => {
    const headers = { ...request.headers(), "x-api-key": TEST_API_KEY };
    delete headers.authorization;
    await route.continue({ headers });
  });

  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sub: "test-user",
        name: "Test User",
        preferred_username: "testuser",
        email: "test@example.com",
        roles: opts.isAdmin ? ["user", "admin"] : ["user"],
        isAdmin: Boolean(opts.isAdmin),
        expires_in: 3600,
        groups: [{ id: SEED_GROUP_ID, name: "Default" }],
      }),
    });
  });

  await page.route("**/api/auth/refresh", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ expires_in: 3600 }),
    });
  });

  await page.goto(`${FRONTEND_URL}${opts.goto ?? "/"}`);
  await page.waitForLoadState("networkidle");
}
