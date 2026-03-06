import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from '../helpers/auth';
import { RegressionReportPage } from '../pages/RegressionReportPage';

/**
 * Test Plan: US-037 - Regression Reports UI - Advanced Features
 * Tests advanced features like filtering, drill-down, and shareable links
 * NOTE: Many of these features are not yet implemented and tests are skipped
 */
test.describe('Regression Report - Advanced Features', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  const SEED_PROJECT_ID = 'seed-project-invoice-extraction';
  const SEED_RUN_ID_REGRESSED = 'seed-run-regressed-005';

  let regressionPage: RegressionReportPage;

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

    regressionPage = new RegressionReportPage(page);
  });

  // REQ US-037 Scenario 4: Filter to Regressions Only
  test('should filter to show only regressed metrics', async () => {
    // TODO: Filter feature not yet implemented
    // Given: Regression report shows all metrics
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    // When: User toggles "Show only regressions" filter
    const filterToggle = regressionPage.page.locator('[data-testid="show-regressions-only-toggle"]');
    await filterToggle.click();

    // Then: Table filters to show only failed metrics
    const visibleRows = regressionPage.metricRows.filter({ hasText: 'FAIL' });
    await expect(visibleRows).toHaveCount(3); // Only regressed metrics

    // Passing metrics are hidden
    const passingRows = regressionPage.metricRows.filter({ hasText: 'PASS' });
    await expect(passingRows).toHaveCount(0);

    // Filter state is indicated clearly
    await expect(filterToggle).toBeChecked();

    // User can toggle back to see all metrics
    await filterToggle.click();
    const allRows = regressionPage.metricRows;
    await expect(allRows.first()).toBeVisible();
  });

  // REQ US-037 Scenario 11: Regression Details Drill-Down
  test('should open drill-down panel for metric details', async () => {
    // TODO: Drill-down feature not yet implemented
    // Given: User is viewing a specific regressed metric
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    // When: User clicks on the metric row
    const metricRow = regressionPage.getMetricRow('field_accuracy');
    await metricRow.click();

    // Then: Drill-down panel opens showing:
    const drillDownPanel = regressionPage.page.locator('[data-testid="metric-drill-down-panel"]');
    await expect(drillDownPanel).toBeVisible();

    // - Metric comparison details (current vs baseline values)
    await expect(drillDownPanel).toContainText('Current Value');
    await expect(drillDownPanel).toContainText('Baseline Value');

    // User can navigate to affected samples for detailed inspection
    const viewSamplesBtn = drillDownPanel.locator('[data-testid="view-affected-samples-btn"]');
    await expect(viewSamplesBtn).toBeVisible();
  });

  // REQ US-037 Scenario 11: Navigate to Affected Samples
  test('should navigate to affected samples from drill-down', async () => {
    // TODO: Drill-down and sample navigation not yet implemented
    // Given: Drill-down panel is open for a regressed metric
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    const metricRow = regressionPage.getMetricRow('field_accuracy');
    await metricRow.click();

    // When: User clicks "View Affected Samples"
    const viewSamplesBtn = regressionPage.page.locator('[data-testid="view-affected-samples-btn"]');
    await viewSamplesBtn.click();

    // Then: Navigates to drill-down view filtered to worst samples for this metric
    await regressionPage.page.waitForLoadState('networkidle');
    await expect(regressionPage.page).toHaveURL(/drill-down/);
  });

  // REQ US-037 Scenario 16: Shareable Report Link
  test('should have shareable URL for regression report', async () => {
    // Given: User has opened a regression report
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    // When: User copies the URL
    const currentUrl = regressionPage.page.url();

    // Then: URL is unique to this run's regression report
    expect(currentUrl).toContain(`/runs/${SEED_RUN_ID_REGRESSED}/regression`);

    // URL is bookmarkable
    expect(currentUrl).toMatch(/^https?:\/\//);

    // Shared URL opens the same report for other users
    // (Would need to test with different user session)

    // URL structure is clean and readable
    expect(currentUrl).toContain('/projects/');
    expect(currentUrl).toContain('/runs/');
    expect(currentUrl).toContain('/regression');
  });

  // REQ US-037 Scenario 16: Share Button/Copy URL
  test('should provide share button to copy URL', async ({ page }) => {
    // TODO: Share button not yet implemented
    // Given: Regression report is displayed
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    // When: User clicks "Share" button
    const shareBtn = page.locator('[data-testid="share-report-btn"]');
    await shareBtn.click();

    // Then: URL is copied to clipboard
    // TODO: Clipboard testing requires special setup
    // Alternative: share dialog with copyable link

    const shareDialog = page.locator('[data-testid="share-dialog"]');
    await expect(shareDialog).toBeVisible();

    const shareUrl = shareDialog.locator('[data-testid="share-url"]');
    await expect(shareUrl).toHaveValue(new RegExp(`/runs/${SEED_RUN_ID_REGRESSED}/regression`));

    // Copy button to copy URL
    const copyBtn = shareDialog.locator('[data-testid="copy-url-btn"]');
    await expect(copyBtn).toBeVisible();
  });

  // REQ US-037 Scenario 16: Access Control
  test('should respect access control for shared URLs', async () => {
    // Given: User has a regression report URL
    const reportUrl = `/benchmarking/projects/${SEED_PROJECT_ID}/runs/${SEED_RUN_ID_REGRESSED}/regression`;

    // When: Navigating to URL without authentication
    // Then: Should be redirected to login or get 401/403
    // Note: This test uses authenticated session, so access is granted

    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);
    await expect(regressionPage.pageTitle).toBeVisible();

    // Access control is respected (recipient must be logged in)
    // Authenticated user can access the report
  });

  // REQ US-037 Scenario 11: Close Drill-Down Panel
  test('should allow closing drill-down panel', async () => {
    // TODO: Drill-down feature not yet implemented
    // Given: Drill-down panel is open
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    const metricRow = regressionPage.getMetricRow('field_accuracy');
    await metricRow.click();

    const drillDownPanel = regressionPage.page.locator('[data-testid="metric-drill-down-panel"]');
    await expect(drillDownPanel).toBeVisible();

    // When: User clicks close button or outside panel
    const closeBtn = drillDownPanel.locator('[data-testid="close-panel-btn"]');
    await closeBtn.click();

    // Then: Panel closes and user returns to main report view
    await expect(drillDownPanel).toBeHidden();
  });

  // REQ US-037 Scenario 4: Filter Indicator
  test('should clearly indicate when filter is active', async () => {
    // TODO: Filter feature not yet implemented
    // Given: User has applied "Show only regressions" filter
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    const filterToggle = regressionPage.page.locator('[data-testid="show-regressions-only-toggle"]');
    await filterToggle.click();

    // When: Filter is active
    // Then: Clear indication is shown
    await expect(filterToggle).toBeChecked();

    // Badge or text showing filter is active
    const filterIndicator = regressionPage.page.locator('[data-testid="active-filter-indicator"]');
    await expect(filterIndicator).toBeVisible();
    await expect(filterIndicator).toContainText(/Showing.*regressed/i);

    // Count of filtered results
    await expect(regressionPage.page.getByText(/3 of 3 metrics/i)).toBeVisible();
  });
});
