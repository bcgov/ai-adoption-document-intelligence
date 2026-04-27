import { test } from '@playwright/test';
import { setupAuthenticatedTest } from '../helpers/auth';
import { RunDrillDownPage } from '../pages/RunDrillDownPage';

test.describe('US-038: Slicing, Filtering & Drill-Down - Metrics Breakdown', () => {
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

  // Scenario 11: Metrics Breakdown by Dimension
  test('should show metrics breakdown by dimension', async ({ page }) => {
    // REQ-038.11: Metrics breakdown by dimension
    // TODO: Metrics breakdown view not yet implemented

    // Given: User has selected a dimension for slicing (e.g., docType)
    // TODO: Implement when metrics breakdown section is available

    // When: Metrics breakdown view is rendered

    // Then: Table/chart shows metrics per dimension value:
    //   - docType: invoice | F1: 0.95 | Precision: 0.96 | Recall: 0.94
    //   - docType: form | F1: 0.88 | Precision: 0.90 | Recall: 0.86
    // await expect(page.getByText(/docType: invoice/i)).toBeVisible();
    // await expect(page.getByText(/F1:/i)).toBeVisible();

    // And: Visualization (bar chart) compares metrics across dimension values
    // await expect(page.locator('canvas, svg')).toBeVisible(); // Chart element

    // And: User can identify which document types perform best/worst
  });

  // Scenario 12: Interactive Breakdown Chart
  test('should support interactive breakdown chart', async ({ page }) => {
    // REQ-038.12: Interactive breakdown chart
    // TODO: Interactive breakdown chart not yet implemented

    // Given: Metrics breakdown chart is displayed
    // TODO: Implement when breakdown chart is available

    // When: User hovers over chart element (e.g., bar for "invoice")
    // await page.locator('canvas, svg').hover();

    // Then: Tooltip shows detailed metric values
    // await expect(page.locator('[role="tooltip"]')).toBeVisible();

    // When: User clicks a chart element
    // await page.locator('canvas, svg').click();

    // Then: Sample view filters to that dimension value
    // const sampleCountText = await drillDownPage.getSampleCountText();
    // expect(sampleCountText).toMatch(/Showing \d+ of 50/); // Filtered

    // And: Chart is interactive and responsive
    // And: User can drill down from the visualization
  });
});
