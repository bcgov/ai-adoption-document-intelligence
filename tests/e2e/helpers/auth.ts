import { Page } from '@playwright/test';

/**
 * Creates a fake JWT token for testing
 * The frontend only decodes the payload to display user info, doesn't validate signature
 */
export function createFakeJWT(payload: Record<string, unknown>): string {
  const header = { alg: 'none', typ: 'JWT' };

  const base64UrlEncode = (obj: Record<string, unknown>) => {
    const json = JSON.stringify(obj);
    const base64 = Buffer.from(json).toString('base64');
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  };

  const encodedHeader = base64UrlEncode(header);
  const encodedPayload = base64UrlEncode(payload);

  // No signature needed for frontend testing
  return `${encodedHeader}.${encodedPayload}.fake-signature`;
}

/**
 * Injects mock authentication tokens into localStorage
 * This bypasses SSO authentication for testing
 *
 * @param page - Playwright page object
 * @param userProfile - Optional user profile data (defaults to Test User)
 */
export async function injectMockAuth(
  page: Page,
  userProfile?: {
    name?: string;
    email?: string;
    sub?: string;
    preferred_username?: string;
  }
): Promise<void> {
  const profile = {
    name: userProfile?.name || 'Test User',
    preferred_username: userProfile?.preferred_username || 'testuser',
    email: userProfile?.email || 'test@example.com',
    sub: userProfile?.sub || 'test-user',
  };

  await page.evaluate((profile) => {
    const createFakeJWT = (payload: Record<string, unknown>) => {
      const header = { alg: 'none', typ: 'JWT' };
      const base64UrlEncode = (obj: Record<string, unknown>) => {
        const json = JSON.stringify(obj);
        const base64 = btoa(json);
        return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
      };
      return `${base64UrlEncode(header)}.${base64UrlEncode(payload)}.fake-signature`;
    };

    const fakeIdToken = createFakeJWT(profile);

    const mockAuthTokens = {
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      id_token: fakeIdToken,
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };

    localStorage.setItem('auth_tokens', JSON.stringify(mockAuthTokens));
  }, profile);
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
  // Set up API key interception first
  await setupApiKeyAuth(page, options.apiKey, options.backendUrl);

  // Navigate to the app
  await page.goto(options.frontendUrl);

  // Inject mock auth tokens
  await injectMockAuth(page, options.userProfile);

  // Reload to pick up the auth tokens
  await page.reload();
  await page.waitForLoadState('networkidle');
}
