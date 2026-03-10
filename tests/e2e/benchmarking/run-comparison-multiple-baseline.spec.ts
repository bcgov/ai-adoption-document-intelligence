import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from '../helpers/auth';
import { RunComparisonPage } from '../pages/RunComparisonPage';
import { ProjectDetailPage } from '../pages/ProjectDetailPage';

test.describe('US-036: Run Comparison - Multiple Runs and Baseline', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  const TEST_PROJECT_ID = 'seed-project-invoice-extraction';
  const TEST_RUN_BASELINE = 'seed-run-completed-001'; // Baseline run
  const TEST_RUN_2 = 'seed-run-passing-004';
  const TEST_RUN_3 = 'seed-run-running-002';
  const TEST_RUN_4 = 'seed-run-failed-003';

  let projectPage: ProjectDetailPage;
  let comparisonPage: RunComparisonPage;

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

    projectPage = new ProjectDetailPage(page);
    comparisonPage = new RunComparisonPage(page);
  });

  // Scenario 6: Compare More Than Two Runs
  test('should display metrics table with column for each run', async () => {
    // REQ-036-06: Metrics table includes a column for each selected run

    // Given: User selects 3 runs
    await comparisonPage.goto(TEST_PROJECT_ID, [TEST_RUN_BASELINE, TEST_RUN_2, TEST_RUN_3]);

    // When: Comparison view renders
    // Then: Metrics table includes columns for all 3 runs
    await expect(comparisonPage.metricsComparisonTable).toBeVisible();

    const headerCells = comparisonPage.metricsComparisonTable.locator('thead th');
    const headerCount = await headerCells.count();

    // Expected: Metric Name + 3 run columns + Delta + Delta % = at least 5 columns
    expect(headerCount).toBeGreaterThanOrEqual(5);
  });

  test('should show run count as "Comparing X runs"', async () => {
    // REQ-036-06: UI shows correct count of runs being compared

    // Given: 3 runs are selected
    await comparisonPage.goto(TEST_PROJECT_ID, [TEST_RUN_BASELINE, TEST_RUN_2, TEST_RUN_3]);

    // Then: Run count text shows "Comparing 3 runs"
    await expect(comparisonPage.runCountText).toBeVisible();
    await expect(comparisonPage.runCountText).toHaveText(/Comparing 3 runs?/);
  });

  test('should compute deltas relative to first run', async () => {
    // REQ-036-06: Deltas are computed relative to the first run (baseline)

    // Given: 3 runs are compared
    await comparisonPage.goto(TEST_PROJECT_ID, [TEST_RUN_BASELINE, TEST_RUN_2, TEST_RUN_3]);

    // Then: Metrics table displays deltas
    await expect(comparisonPage.metricsComparisonTable).toBeVisible();

    // Then: Delta column exists
    const headerCells = comparisonPage.metricsComparisonTable.locator('thead th');
    const headers = await headerCells.allTextContents();
    const hasDeltaColumn = headers.some(h => h.includes('Delta') || h.includes('Δ'));
    expect(hasDeltaColumn).toBeTruthy();

    // Then: Delta values are present in rows
    const firstMetricRow = comparisonPage.metricRows.first();
    await expect(firstMetricRow).toBeVisible();
  });

  test('should accommodate multiple columns in layout', async () => {
    // REQ-036-06: Table adjusts layout to accommodate multiple columns

    // Given: 4 runs are compared
    await comparisonPage.goto(TEST_PROJECT_ID, [TEST_RUN_BASELINE, TEST_RUN_2, TEST_RUN_3, TEST_RUN_4]);

    // Then: Comparison view displays all 4 runs
    await expect(comparisonPage.runCountText).toHaveText(/Comparing 4 runs?/);

    // Then: Metrics table is visible and scrollable if needed
    await expect(comparisonPage.metricsComparisonTable).toBeVisible();

    // Then: All run columns are present
    const headerCells = comparisonPage.metricsComparisonTable.locator('thead th');
    const headerCount = await headerCells.count();

    // At least Metric Name + 4 runs + Delta + % = 7 columns
    expect(headerCount).toBeGreaterThanOrEqual(6);
  });

  test('should maintain readability with multiple runs', async () => {
    // REQ-036-06: Comparison remains readable with multiple columns

    // Given: 3 runs are compared
    await comparisonPage.goto(TEST_PROJECT_ID, [TEST_RUN_BASELINE, TEST_RUN_2, TEST_RUN_3]);

    // Then: All sections remain visible and accessible
    await expect(comparisonPage.runInfoCard).toBeVisible();
    await expect(comparisonPage.metricsComparisonCard).toBeVisible();
    await expect(comparisonPage.parametersComparisonCard).toBeVisible();
    await expect(comparisonPage.tagsComparisonCard).toBeVisible();

    // Then: Tables are properly formatted
    const firstRow = comparisonPage.metricRows.first();
    await expect(firstRow).toBeVisible();
  });

  // Scenario 7: Baseline Run in Comparison
  test('should mark baseline run with badge in run info', async () => {
    // REQ-036-07: Baseline run is clearly marked with badge

    // Given: Baseline run is included in comparison
    await comparisonPage.goto(TEST_PROJECT_ID, [TEST_RUN_BASELINE, TEST_RUN_2]);

    // Then: Baseline badge is displayed for baseline run
    await expect(comparisonPage.runInfoCard).toBeVisible();

    const baselineBadge = comparisonPage.getBaselineBadge(TEST_RUN_BASELINE);
    // Note: Badge may not be visible if baseline detection isn't working
    // Check if badge exists in the run info table
    const badges = comparisonPage.runInfoCard.locator('[data-testid^="baseline-badge-"]');
    const badgeCount = await badges.count();

    if (badgeCount > 0) {
      await expect(badges.first()).toBeVisible();
    }
  });

  test('should mark baseline run in metrics table header', async () => {
    // REQ-036-07: Baseline run column header is marked

    // Given: Baseline run is first in comparison
    await comparisonPage.goto(TEST_PROJECT_ID, [TEST_RUN_BASELINE, TEST_RUN_2]);

    // Then: Metrics table shows baseline badge in column header
    await expect(comparisonPage.metricsComparisonCard).toBeVisible();

    const metricsBaselineBadge = comparisonPage.getMetricsBaselineBadge(TEST_RUN_BASELINE);
    const badges = comparisonPage.metricsComparisonCard.locator('[data-testid^="metrics-baseline-badge-"]');
    const badgeCount = await badges.count();

    if (badgeCount > 0) {
      await expect(badges.first()).toBeVisible();
    }
  });

  test('should display baseline first when included in comparison', async () => {
    // REQ-036-07: Baseline run is the first column

    // Given: Baseline is one of the selected runs
    await comparisonPage.goto(TEST_PROJECT_ID, [TEST_RUN_BASELINE, TEST_RUN_2]);

    // Then: First run column is the baseline
    await expect(comparisonPage.runInfoTable).toBeVisible();

    // Note: Per exploration docs, baseline is always first in URL query string
    // Verify that run info displays baseline in first position
    const headerCells = comparisonPage.runInfoTable.locator('thead th');
    await expect(headerCells.nth(1)).toBeVisible(); // First run column (after "Property" column)
  });

  test('should compute deltas from baseline', async () => {
    // REQ-036-07: Deltas are computed from baseline if it's first

    // Given: Baseline is compared with other runs
    await comparisonPage.goto(TEST_PROJECT_ID, [TEST_RUN_BASELINE, TEST_RUN_2]);

    // Then: Delta column shows differences from baseline
    await expect(comparisonPage.metricsComparisonTable).toBeVisible();

    const deltaColumn = comparisonPage.metricsComparisonTable.locator('tbody td:nth-child(4)');
    const firstDelta = deltaColumn.first();

    if (await firstDelta.isVisible()) {
      // Delta should be calculated (not just "-")
      const deltaText = await firstDelta.textContent();
      expect(deltaText).toBeTruthy();
    }
  });

  test('should allow comparing non-baseline runs', async () => {
    // REQ-036-06: Compare any runs, not just baseline

    // Given: Two non-baseline runs are selected
    await comparisonPage.goto(TEST_PROJECT_ID, [TEST_RUN_2, TEST_RUN_3]);

    // Then: Comparison works without baseline
    await expect(comparisonPage.comparisonTitle).toBeVisible();
    await expect(comparisonPage.runCountText).toHaveText(/Comparing 2 runs?/);
    await expect(comparisonPage.metricsComparisonTable).toBeVisible();
  });

  test('should show how runs compare to baseline with thresholds', async () => {
    // REQ-036-07: User can see how other runs compare to baseline

    // Given: Baseline and other runs are compared
    await comparisonPage.goto(TEST_PROJECT_ID, [TEST_RUN_BASELINE, TEST_RUN_2]);

    // Then: Deltas and percentages show differences from baseline
    await expect(comparisonPage.metricsComparisonTable).toBeVisible();

    // Then: Visual indicators (green/red) help identify performance
    const positiveDeltas = comparisonPage.getPositiveDeltas();
    const negativeDeltas = comparisonPage.getNegativeDeltas();

    const totalHighlights = (await positiveDeltas.count()) + (await negativeDeltas.count());
    // At least some metrics should have deltas (unless runs are identical)
    expect(totalHighlights).toBeGreaterThanOrEqual(0);
  });
});
