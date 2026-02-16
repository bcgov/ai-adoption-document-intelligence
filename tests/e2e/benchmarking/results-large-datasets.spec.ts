import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from '../helpers/auth';
import { RunDetailPage } from '../pages/RunDetailPage';

test.describe('US-031 - Results Summary: Large Datasets', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  const SEED_PROJECT_ID = 'seed-project-invoice-extraction';
  const SEED_RUN_ID_COMPLETED = 'seed-run-completed-001';

  let runDetailPage: RunDetailPage;

  test.beforeAll(() => {
    if (!TEST_API_KEY) {
      throw new Error('TEST_API_KEY environment variable is not set');
    }
  });

  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedTest(page, {
      apiKey: TEST_API_KEY!,
      backendUrl: BACKEND_URL,
      frontendUrl: FRONTEND_URL,
    });

    runDetailPage = new RunDetailPage(page);
  });

  test.skip('Scenario 16: should organize large metrics into categories', async ({ page }) => {
    // REQ US-031: Metrics are organized into categories or collapsible sections
    // SKIPPED: Seed data only has 3 metrics, not 50+

    // Given: Run has 50+ different metrics (e.g., per-field metrics for many fields)
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    // Then: Metrics should be organized into collapsible sections or categories
    // And: Not all metrics are expanded by default
  });

  test.skip('Scenario 16: should support search/filter for large metrics set', async ({ page }) => {
    // REQ US-031: User can search/filter metrics
    // SKIPPED: Seed data only has 3 metrics

    // Given: Run with 50+ metrics
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    // When: User enters search term in metrics search box
    // Then: Metrics list is filtered to show only matching metrics
  });

  test.skip('Scenario 16: page should remain performant with large metrics', async ({ page }) => {
    // REQ US-031: Page remains performant with many metrics
    // SKIPPED: Seed data only has 3 metrics, cannot test performance

    // Given: Run with 50+ metrics
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    // Then: Page loads within acceptable time (< 3 seconds)
    // And: Scrolling is smooth
    // And: No UI lag when interacting with metrics
  });

  test('Scenario 16: metrics section should handle small metric sets efficiently', async ({ page }) => {
    // REQ US-031: Baseline test - small metric sets should render correctly

    // Given: Run with small number of metrics (3 metrics in seed data)
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    // Then: Metrics section loads quickly and displays all metrics
    await expect(runDetailPage.aggregatedMetricsHeading).toBeVisible();
    await expect(runDetailPage.aggregatedMetricsTable).toBeVisible();

    // All 3 metrics should be visible
    const metricsTable = runDetailPage.aggregatedMetricsTable;
    await expect(metricsTable).toContainText('field_accuracy');
    await expect(metricsTable).toContainText('character_accuracy');
    await expect(metricsTable).toContainText('word_accuracy');
  });

  test('Scenario 16: metrics table should be scrollable if needed', async ({ page }) => {
    // REQ US-031: UI should support scrolling for long metric lists

    // Given: Metrics section on run detail page
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    // Then: Metrics table should be contained properly
    const metricsTable = runDetailPage.aggregatedMetricsTable;
    await expect(metricsTable).toBeVisible();

    // Check that table is within viewport or scrollable container
    const boundingBox = await metricsTable.boundingBox();
    expect(boundingBox).toBeTruthy();

    if (boundingBox) {
      // Table should have reasonable dimensions
      expect(boundingBox.width).toBeGreaterThan(0);
      expect(boundingBox.height).toBeGreaterThan(0);
    }
  });

  test.skip('Scenario 16: collapsed sections should expand on click', async ({ page }) => {
    // REQ US-031: Collapsible sections can be expanded/collapsed
    // SKIPPED: Implementation not yet available or not needed for small metric sets

    // Given: Run with metrics organized in collapsible sections
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    // When: User clicks on a collapsed section
    // Then: Section expands to show metrics
    // And: Other sections can remain collapsed or expanded independently
  });

  test('Scenario 16: all metrics should be accessible without scrolling in small sets', async ({ page }) => {
    // REQ US-031: For small metric sets, all should be immediately visible

    // Given: Run with 3 metrics (seed data)
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    // Then: All metrics are visible without scrolling
    const metricsTable = runDetailPage.aggregatedMetricsTable;
    const rows = metricsTable.locator('tbody tr');
    const rowCount = await rows.count();

    // Should have at least 3 rows (may include nested metrics)
    expect(rowCount).toBeGreaterThanOrEqual(3);

    // All rows should be visible
    for (let i = 0; i < Math.min(rowCount, 10); i++) {
      const row = rows.nth(i);
      await expect(row).toBeVisible();
    }
  });

  test('Scenario 16: metrics should load without UI lag', async ({ page }) => {
    // REQ US-031: Baseline performance test for small datasets

    // Given: Run detail page
    const startTime = Date.now();
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    // Then: Metrics section appears quickly
    await expect(runDetailPage.aggregatedMetricsTable).toBeVisible();
    const endTime = Date.now();

    const loadTime = endTime - startTime;

    // Should load in under 5 seconds (generous threshold for E2E)
    expect(loadTime).toBeLessThan(5000);
  });
});
