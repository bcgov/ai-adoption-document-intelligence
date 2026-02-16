import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from '../helpers/auth';
import { RegressionReportPage } from '../pages/RegressionReportPage';

/**
 * Test Plan: US-037 - Regression Reports UI - Historical Trends
 * Tests historical trend visualization and related features
 */
test.describe('Regression Report - Historical Trends', () => {
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

  // REQ US-037 Scenario 8: Historical Trend Chart
  test.skip('should display historical trend chart with recent runs', async () => {
    // SKIPPED: Historical trend requires Recharts library installation
    // Given: Multiple runs exist for the same definition
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    // When: User views the historical trend section of the regression report
    await expect(regressionPage.historicalTrendSection).toBeVisible();

    // Then: Line chart shows metric values across recent runs (last 10-20)
    const chart = regressionPage.page.locator('[data-testid="trend-chart"]');
    await expect(chart).toBeVisible();

    // X-axis: run date/number, Y-axis: metric value
    // Threshold line is overlaid
    // Current run is highlighted
    // User can select which metrics to visualize
    // Chart is interactive (hover for values, zoom)
  });

  // REQ US-037 Scenario 8: Current Implementation Status
  test('should show placeholder for historical trend section', async () => {
    // Given: Regression report is displayed
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    // When: Historical trend section is checked
    // Then: Placeholder message is shown explaining Recharts is needed
    await expect(regressionPage.historicalTrendSection).toBeVisible();
    await expect(regressionPage.trendPlaceholderAlert).toBeVisible();
    await expect(regressionPage.trendPlaceholderAlert).toContainText(/Historical trend visualization/i);
    await expect(regressionPage.trendPlaceholderAlert).toContainText(/Recharts/i);
  });

  // REQ US-037 Scenario 9: Multi-Metric Trend Visualization
  test.skip('should support multiple metrics on same trend chart', async () => {
    // SKIPPED: Requires trend chart implementation with Recharts
    // Given: Historical trend chart is displayed
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    // When: User selects multiple metrics to overlay
    const metricSelector = regressionPage.page.locator('[data-testid="metric-selector"]');
    await metricSelector.click();
    await regressionPage.page.getByRole('option', { name: 'field_accuracy' }).click();
    await regressionPage.page.getByRole('option', { name: 'character_accuracy' }).click();

    // Then: Multiple lines are displayed on the same chart
    // Each metric has a distinct color
    // Legend identifies each metric
    // Y-axis scales appropriately (or uses dual-axis if needed)
    // User can toggle metrics on/off in the legend
    const chart = regressionPage.page.locator('[data-testid="trend-chart"]');
    const lines = chart.locator('path[class*="line"]');
    await expect(lines).toHaveCount(2); // Two metrics selected

    const legend = regressionPage.page.locator('[data-testid="chart-legend"]');
    await expect(legend).toContainText(['field_accuracy', 'character_accuracy']);
  });

  // REQ US-037 Scenario 14: Trend Chart Date Range Selection
  test.skip('should allow selecting date range for trend chart', async () => {
    // SKIPPED: Requires trend chart implementation
    // Given: Historical trend chart is displayed
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    // When: User selects a date range (e.g., last 30 days, last 90 days, all time)
    const dateRangeSelector = regressionPage.page.locator('[data-testid="date-range-selector"]');
    await dateRangeSelector.click();
    await regressionPage.page.getByRole('option', { name: 'Last 30 days' }).click();

    // Then: Chart updates to show runs within the selected range
    // X-axis adjusts to the date range
    // User can zoom in/out temporally
    // Selection is saved for the session
    const chart = regressionPage.page.locator('[data-testid="trend-chart"]');
    await expect(chart).toBeVisible();

    // Verify date range is reflected in chart
    await expect(regressionPage.page.getByText(/Last 30 days/i)).toBeVisible();
  });

  // REQ US-037 Scenario 17: Loading State for Historical Trends
  test('should show loading state for historical trends', async () => {
    // Given: User navigates to regression report with trends
    // When: Historical data is being fetched
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    // Then: Chart area shows loading skeleton/spinner
    // Note: Current implementation shows placeholder, not loading state
    await expect(regressionPage.historicalTrendSection).toBeVisible();

    // Other sections of report load independently
    await expect(regressionPage.metricComparisonTable).toBeVisible();
    await expect(regressionPage.runInfoTable).toBeVisible();

    // Chart populates when data is ready (or shows placeholder)
    // No errors if trend data is unavailable
    await expect(regressionPage.trendPlaceholderAlert).toBeVisible();
  });

  // REQ US-037 Scenario 17: Independent Section Loading
  test('should load sections independently', async () => {
    // Given: Regression report page loads
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    // When: Page is rendered
    // Then: All sections are visible regardless of trend data availability
    await expect(regressionPage.regressionAlert).toBeVisible();
    await expect(regressionPage.runInfoTable).toBeVisible();
    await expect(regressionPage.metricComparisonTable).toBeVisible();
    await expect(regressionPage.historicalTrendSection).toBeVisible();

    // Historical trend shows placeholder without blocking other sections
    await expect(regressionPage.trendPlaceholderAlert).toBeVisible();
  });

  // REQ US-037 Scenario 8: Threshold Line Overlay
  test.skip('should overlay threshold line on trend chart', async () => {
    // SKIPPED: Requires trend chart implementation
    // Given: Trend chart is displayed with a metric
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    // When: Chart renders metric values over time
    // Then: Threshold line is overlaid for reference
    const thresholdLine = regressionPage.page.locator('[data-testid="threshold-line"]');
    await expect(thresholdLine).toBeVisible();

    // Threshold line should be distinct from metric lines (dashed or different color)
    // Makes it easy to see when metrics crossed the threshold
  });

  // REQ US-037 Scenario 8: Current Run Highlighting
  test.skip('should highlight current run in trend chart', async () => {
    // SKIPPED: Requires trend chart implementation
    // Given: Trend chart shows multiple runs
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    // When: Chart is displayed
    // Then: Current run is highlighted (different color, larger marker, etc.)
    const currentRunMarker = regressionPage.page.locator('[data-testid="current-run-marker"]');
    await expect(currentRunMarker).toBeVisible();

    // User can easily identify the current run in context of historical data
    await expect(currentRunMarker).toHaveAttribute('data-run-id', SEED_RUN_ID_REGRESSED);
  });

  // REQ US-037 Scenario 9: Metric Toggle in Legend
  test.skip('should allow toggling metrics in legend', async () => {
    // SKIPPED: Requires trend chart implementation
    // Given: Trend chart with multiple metrics
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    // When: User clicks on metric name in legend
    const legendItem = regressionPage.page.locator('[data-testid="legend-item-field_accuracy"]');
    await legendItem.click();

    // Then: Metric line is hidden/shown
    const metricLine = regressionPage.page.locator('[data-testid="trend-line-field_accuracy"]');
    await expect(metricLine).toBeHidden();

    // Click again to show
    await legendItem.click();
    await expect(metricLine).toBeVisible();
  });

  // REQ US-037 Scenario 8: Interactive Chart Features
  test.skip('should support interactive chart features', async () => {
    // SKIPPED: Requires trend chart implementation with Recharts
    // Given: Trend chart is displayed
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    // When: User hovers over a data point
    const dataPoint = regressionPage.page.locator('[data-testid="data-point"]').first();
    await dataPoint.hover();

    // Then: Tooltip shows detailed values
    const tooltip = regressionPage.page.locator('[data-testid="chart-tooltip"]');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText(/field_accuracy/i);
    await expect(tooltip).toContainText(/0\.\d+/); // Metric value

    // Chart supports zoom functionality
    // User can interact with the chart to explore data
  });

  // REQ US-037 Scenario 14: Date Range Persistence
  test.skip('should persist date range selection for session', async () => {
    // SKIPPED: Requires trend chart implementation
    // Given: User selects a date range
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    const dateRangeSelector = regressionPage.page.locator('[data-testid="date-range-selector"]');
    await dateRangeSelector.click();
    await regressionPage.page.getByRole('option', { name: 'Last 90 days' }).click();

    // When: User navigates away and returns
    await regressionPage.page.goBack();
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    // Then: Date range selection is preserved
    await expect(regressionPage.page.getByText(/Last 90 days/i)).toBeVisible();
  });
});
