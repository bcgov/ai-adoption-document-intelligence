import { test, expect } from '@playwright/test';

/**
 * Test navigating to Training Labels page with API key authentication
 * This test intercepts all requests and adds the x-api-key header
 */
test.describe('Training Labels with API Key', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  test.beforeAll(() => {
    if (!TEST_API_KEY) {
      throw new Error('TEST_API_KEY environment variable is not set');
    }
  });

  test('should display SDPR monthly report template project', async ({ page }) => {
    // Intercept all requests to the backend and add x-api-key header
    await page.route(`${BACKEND_URL}/**`, async (route, request) => {
      const headers = {
        ...request.headers(),
        'x-api-key': TEST_API_KEY!,
      };

      // Remove Authorization header if present (we're using API key instead)
      delete headers['authorization'];

      await route.continue({ headers });
    });

    // Navigate to the app
    await page.goto(FRONTEND_URL);

    // Inject mock auth tokens
    await page.evaluate(() => {
      const createFakeJWT = (payload: Record<string, unknown>) => {
        const header = { alg: 'none', typ: 'JWT' };
        const base64UrlEncode = (obj: Record<string, unknown>) => {
          const json = JSON.stringify(obj);
          const base64 = btoa(json);
          return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        };
        return `${base64UrlEncode(header)}.${base64UrlEncode(payload)}.fake-signature`;
      };

      const fakeIdToken = createFakeJWT({
        name: 'Test User',
        preferred_username: 'testuser',
        email: 'test@example.com',
        sub: 'test-user',
      });

      const mockAuthTokens = {
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        id_token: fakeIdToken,
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      };

      localStorage.setItem('auth_tokens', JSON.stringify(mockAuthTokens));
    });

    // Reload to pick up the auth tokens
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify we're authenticated (not showing login screen)
    const loginButton = page.getByRole('button', { name: /login with idir/i });
    await expect(loginButton).not.toBeVisible();

    // Click on Training Labels navigation
    await page.getByText('Training Labels').click();

    // Wait for the projects to load
    await page.waitForLoadState('networkidle');

    // Verify the page title
    const pageTitle = page.getByRole('heading', { name: /training label projects/i });
    await expect(pageTitle).toBeVisible();

    // Verify the SDPR monthly report template project is displayed
    const projectCard = page.getByText('SDPR monthly report template').first();
    await expect(projectCard).toBeVisible();

    // Take a screenshot
    await page.screenshot({
      path: 'test-results/training-labels-with-projects.png',
      fullPage: true,
    });

    console.log('✅ Screenshot saved to test-results/training-labels-with-projects.png');
  });

  test('should navigate into project details', async ({ page }) => {
    // Intercept all requests and add x-api-key header
    await page.route(`${BACKEND_URL}/**`, async (route, request) => {
      const headers = {
        ...request.headers(),
        'x-api-key': TEST_API_KEY!,
      };
      delete headers['authorization'];
      await route.continue({ headers });
    });

    await page.goto(FRONTEND_URL);

    // Inject auth
    await page.evaluate(() => {
      const createFakeJWT = (payload: Record<string, unknown>) => {
        const header = { alg: 'none', typ: 'JWT' };
        const base64UrlEncode = (obj: Record<string, unknown>) => {
          const json = JSON.stringify(obj);
          const base64 = btoa(json);
          return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        };
        return `${base64UrlEncode(header)}.${base64UrlEncode(payload)}.fake-signature`;
      };

      const fakeIdToken = createFakeJWT({
        name: 'Test User',
        preferred_username: 'testuser',
        email: 'test@example.com',
        sub: 'test-user',
      });

      localStorage.setItem(
        'auth_tokens',
        JSON.stringify({
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token',
          id_token: fakeIdToken,
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        })
      );
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    // Navigate to Training Labels
    await page.getByText('Training Labels').click();
    await page.waitForLoadState('networkidle');

    // Click on the SDPR monthly report template project
    await page.getByText('SDPR monthly report template').first().click();

    // Wait for project details to load
    await page.waitForLoadState('networkidle');

    // Verify we're in the project details page
    const projectTitle = page.getByRole('heading', { name: /sdpr monthly report template/i });
    await expect(projectTitle).toBeVisible();

    // Take a screenshot
    await page.screenshot({
      path: 'test-results/training-labels-project-details.png',
      fullPage: true,
    });

    console.log('✅ Screenshot saved to test-results/training-labels-project-details.png');
  });
});
