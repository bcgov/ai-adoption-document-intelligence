import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from '../helpers/auth';
import { RunDrillDownPage } from '../pages/RunDrillDownPage';

test.describe('US-038: Slicing, Filtering & Drill-Down - Advanced Features', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  const SEED_PROJECT_ID = 'seed-project-invoice-extraction';
  const SEED_RUN_ID = 'seed-run-completed-001';

  let drillDownPage: RunDrillDownPage;

  test.beforeAll(() => {
    if (!TEST_API_KEY) {
      throw new Error('TEST_API_KEY environment variable is not set');
    }
  });

  test.beforeEach(async ({ page }) => {
    // Setup authentication
    await setupAuthenticatedTest(page, {
      apiKey: TEST_API_KEY!,
      backendUrl: BACKEND_URL,
      frontendUrl: FRONTEND_URL,
    });

    drillDownPage = new RunDrillDownPage(page);
    await drillDownPage.goto(SEED_PROJECT_ID, SEED_RUN_ID);
  });

  // Scenario 13: Pluggable Drill-Down Panels
  test.skip('should support pluggable custom drill-down panels', async ({ page }) => {
    // REQ-038.13: Pluggable drill-down panels
    // ⚠️ SKIPPED: Pluggable panel architecture not yet implemented

    // Given: Custom panel components are registered for specific workflow types
    // TODO: Implement custom panel registration system

    // When: User opens a drill-down panel for a sample from a custom workflow
    const sampleId = 'sample-001';
    await drillDownPage.openSampleDetail(sampleId);

    // Then: Custom visualization panel is loaded and rendered
    // TODO: Verify custom panel tabs appear
    // await expect(page.getByRole('tab', { name: /custom panel/i })).toBeVisible();

    // And: Panel shows workflow-specific details (e.g., OCR confidence heatmap)
    // await page.getByRole('tab', { name: /custom panel/i }).click();
    // await expect(page.locator('[data-testid="custom-visualization"]')).toBeVisible();

    // And: Pluggable architecture allows extensibility without modifying core code
    // And: Fallback to default panel if no custom panel is registered
    await expect(page.getByRole('tab', { name: /default view/i })).toBeVisible();
  });
});
