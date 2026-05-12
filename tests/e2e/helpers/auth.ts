import { Page } from '@playwright/test';

/**
 * Sets up mock authentication by intercepting the /auth/me endpoint.
 *
 * The frontend uses HttpOnly cookie-based auth: on load, it calls
 * GET /api/auth/me to check the session. We intercept this request
 * and return a mock user profile so the frontend considers the user
 * authenticated without needing real cookies.
 *
 * @param page - Playwright page object
 * @param backendUrl - The backend URL to intercept
 * @param userProfile - Optional user profile data (defaults to Test User)
 */
export async function setupMockAuth(
  page: Page,
  backendUrl: string,
  userProfile?: {
    name?: string;
    email?: string;
    sub?: string;
    preferred_username?: string;
  },
): Promise<void> {
  const profile = {
    name: userProfile?.name || 'Test User',
    preferred_username: userProfile?.preferred_username || 'testuser',
    email: userProfile?.email || 'test@example.com',
    sub: userProfile?.sub || 'test-user',
  };

  // Intercept /auth/me to return a mock authenticated user
  await page.route(`${backendUrl}/api/auth/me`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        sub: profile.sub,
        name: profile.name,
        preferred_username: profile.preferred_username,
        email: profile.email,
        roles: ['user'],
        isAdmin: false,
        expires_in: 3600,
        groups: [{ id: 'seeddefaultgroup', name: 'Default' }],
      }),
    });
  });

  // Intercept /auth/refresh to return a mock refresh response
  await page.route(`${backendUrl}/api/auth/refresh`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        expires_in: 3600,
      }),
    });
  });
}

/**
 * Sets up API key authentication by intercepting all backend requests
 * and adding the x-api-key header
 *
 * @param page - Playwright page object
 * @param apiKey - The API key to use for authentication
 * @param backendUrl - The backend URL to intercept
 */
export async function setupApiKeyAuth(
  page: Page,
  apiKey: string,
  backendUrl: string
): Promise<void> {
  await page.route(`${backendUrl}/**`, async (route, request) => {
    const headers = {
      ...request.headers(),
      'x-api-key': apiKey,
    };

    // Remove Authorization header if present (we're using API key instead)
    delete headers['authorization'];

    await route.continue({ headers });
  });
}

/**
 * Complete setup for E2E tests with both frontend auth and backend API key auth
 * This is the most common setup needed for testing authenticated pages
 *
 * The frontend uses HttpOnly cookie-based auth (GET /api/auth/me).
 * We intercept this endpoint to return a mock user, and intercept all
 * other backend requests to add the x-api-key header.
 *
 * @param page - Playwright page object
 * @param options - Configuration options
 *
 * @example
 * ```typescript
 * await setupAuthenticatedTest(page, {
 *   apiKey: process.env.TEST_API_KEY!,
 *   backendUrl: 'http://localhost:3002',
 *   frontendUrl: 'http://localhost:3000',
 * });
 *
 * // Now you can navigate and interact with the app
 * await page.getByText('Training Labels').click();
 * ```
 */
export async function setupAuthenticatedTest(
  page: Page,
  options: {
    apiKey: string;
    backendUrl: string;
    frontendUrl: string;
    userProfile?: {
      name?: string;
      email?: string;
      sub?: string;
      preferred_username?: string;
    };
  }
): Promise<void> {
  // Set up API key interception for all backend requests first
  await setupApiKeyAuth(page, options.apiKey, options.backendUrl);

  // Set up mock auth (intercept /auth/me) AFTER the general route —
  // Playwright gives priority to the most recently registered matching route
  await setupMockAuth(page, options.backendUrl, options.userProfile);

  // Navigate to the app — the mock /auth/me intercept will authenticate the user
  await page.goto(options.frontendUrl);
  await page.waitForLoadState('networkidle');
}
