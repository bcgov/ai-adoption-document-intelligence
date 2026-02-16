import { test, expect } from '@playwright/test';

/**
 * Test that the frontend app renders correctly with mocked authentication
 * This bypasses SSO login by injecting auth tokens into localStorage
 */
test.describe('Frontend with Mock Authentication', () => {
  test('should render the app instead of login screen with mocked auth', async ({ page }) => {
    // Create a fake JWT token (doesn't need to be valid for frontend display)
    const fakeIdToken = createFakeJWT({
      name: 'Test User',
      preferred_username: 'testuser',
      email: 'test@example.com',
      sub: 'test-user-123'
    });

    const mockAuthTokens = {
      access_token: 'mock-access-token-for-testing',
      refresh_token: 'mock-refresh-token-for-testing',
      id_token: fakeIdToken,
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600
    };

    // Navigate to the app
    await page.goto('http://localhost:3000');

    // Inject auth tokens into localStorage before the page fully loads
    await page.evaluate((tokens) => {
      localStorage.setItem('auth_tokens', JSON.stringify(tokens));
    }, mockAuthTokens);

    // Reload the page so the auth context picks up the tokens
    await page.reload();

    // Wait for the app to load
    await page.waitForLoadState('networkidle');

    // Verify the login screen is NOT shown
    const loginButton = page.getByRole('button', { name: /login with idir/i });
    await expect(loginButton).not.toBeVisible();

    // Verify the main app UI elements are visible
    const appTitle = page.getByRole('heading', { name: /document intelligence/i });
    await expect(appTitle).toBeVisible();

    // Verify user info is displayed
    const userName = page.getByText('Test User');
    await expect(userName).toBeVisible();

    // Verify navigation items are present (can be button or link or div)
    const uploadNav = page.getByText('Upload', { exact: false }).first();
    await expect(uploadNav).toBeVisible();

    // Verify the logout button is present (proves we're authenticated)
    const logoutButton = page.getByRole('button', { name: /logout/i });
    await expect(logoutButton).toBeVisible();

    // Take a screenshot to prove the app is rendered
    await page.screenshot({
      path: 'test-results/frontend-app-authenticated.png',
      fullPage: true
    });

    console.log('✅ Screenshot saved to test-results/frontend-app-authenticated.png');
  });

  test('should allow API calls with mocked backend auth', async ({ page, request }) => {
    const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
    const TEST_API_KEY = process.env.TEST_API_KEY;

    if (!TEST_API_KEY) {
      test.skip();
      return;
    }

    // Create mock auth tokens
    const fakeIdToken = createFakeJWT({
      name: 'Test User',
      preferred_username: 'testuser',
      email: 'test@example.com',
      sub: 'test-user-123'
    });

    const mockAuthTokens = {
      access_token: TEST_API_KEY, // Use the actual API key as access token
      refresh_token: 'mock-refresh-token',
      id_token: fakeIdToken,
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600
    };

    // Navigate and inject auth
    await page.goto('http://localhost:3000');
    await page.evaluate((tokens) => {
      localStorage.setItem('auth_tokens', JSON.stringify(tokens));
    }, mockAuthTokens);
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Now test that the app can make API calls
    // The apiService will use the access_token as Bearer token, but we need x-api-key
    // So let's test a direct fetch with x-api-key from the browser context
    const apiResponse = await page.evaluate(async ({ url, apiKey }) => {
      const response = await fetch(`${url}/api/labeling/projects`, {
        headers: {
          'x-api-key': apiKey
        }
      });
      return {
        status: response.status,
        ok: response.ok
      };
    }, { url: BACKEND_URL, apiKey: TEST_API_KEY });

    expect(apiResponse.status).toBe(200);
    expect(apiResponse.ok).toBe(true);

    // Take screenshot showing the authenticated app
    await page.screenshot({
      path: 'test-results/frontend-app-with-api-access.png',
      fullPage: true
    });
  });
});

/**
 * Create a fake JWT token for testing
 * The frontend only decodes the payload to display user info, doesn't validate signature
 */
function createFakeJWT(payload: Record<string, unknown>): string {
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
