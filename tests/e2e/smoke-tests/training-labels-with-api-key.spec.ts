import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from './helpers/auth';

/**
 * Test navigating to Training Labels page with API key authentication
 * This test uses the auth helper to set up both frontend and backend auth
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
    // Setup authentication (both frontend and backend)
    await setupAuthenticatedTest(page, {
      apiKey: TEST_API_KEY!,
      backendUrl: BACKEND_URL,
      frontendUrl: FRONTEND_URL,
    });

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
    // Setup authentication (both frontend and backend)
    await setupAuthenticatedTest(page, {
      apiKey: TEST_API_KEY!,
      backendUrl: BACKEND_URL,
      frontendUrl: FRONTEND_URL,
    });

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
