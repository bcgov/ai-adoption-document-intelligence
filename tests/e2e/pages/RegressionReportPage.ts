import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for Regression Report page
 * /benchmarking/projects/{projectId}/runs/{runId}/regression
 */
export class RegressionReportPage {
  readonly page: Page;

  // Header elements
  readonly pageTitle: Locator;
  readonly definitionName: Locator;

  // Action buttons
  readonly exportJsonBtn: Locator;
  readonly exportHtmlBtn: Locator;
  readonly backToRunBtn: Locator;

  // Alerts & status
  readonly regressionAlert: Locator;
  readonly successAlert: Locator;
  readonly regressedMetricBadges: Locator;
  readonly noBaselineMessage: Locator;

  // Run information
  readonly runInfoTable: Locator;

  // Metric analysis
  readonly metricComparisonTable: Locator;
  readonly metricRows: Locator;

  // Historical trend
  readonly historicalTrendSection: Locator;
  readonly trendPlaceholderAlert: Locator;

  // Loading states
  readonly loadingSpinner: Locator;
  readonly notFoundMessage: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header
    this.pageTitle = page.getByRole('heading', { name: /Regression Report/i });
    this.definitionName = page.locator('p').first();

    // Action buttons
    this.exportJsonBtn = page.locator('[data-testid="export-json-btn"]');
    this.exportHtmlBtn = page.locator('[data-testid="export-html-btn"]');
    this.backToRunBtn = page.locator('[data-testid="back-to-run-btn"]');

    // Alerts
    this.regressionAlert = page.locator('[data-testid="regression-alert"]');
    this.successAlert = page.getByRole('alert').filter({ hasText: /All Metrics Passed/i });
    this.regressedMetricBadges = page.locator('[data-testid="regressed-metric-badge"]');
    this.noBaselineMessage = page.getByText('No baseline comparison data available');

    // Run information
    this.runInfoTable = page.locator('[data-testid="run-info-table"]');

    // Metric analysis
    this.metricComparisonTable = page.locator('[data-testid="metric-comparison-table"]');
    this.metricRows = page.locator('[data-testid="metric-row"]');

    // Historical trend
    this.historicalTrendSection = page.locator('[data-testid="historical-trend-section"]');
    this.trendPlaceholderAlert = page.getByRole('alert').filter({ hasText: /Historical trend visualization/i });

    // Loading
    this.loadingSpinner = page.getByRole('generic', { name: /Loader/i });
    this.notFoundMessage = page.getByText('Run not found');
  }

  /**
   * Navigate to this page directly
   * @param projectId - The ID of the project
   * @param runId - The ID of the run
   */
  async goto(projectId: string, runId: string) {
    await this.page.goto(`/benchmarking/projects/${projectId}/runs/${runId}/regression`);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Get the regression alert title
   */
  getRegressionAlertTitle(): Locator {
    return this.regressionAlert.getByText(/⚠\s*Regression Detected/i);
  }

  /**
   * Get metric row by metric name
   * @param metricName - Name of the metric
   */
  getMetricRow(metricName: string): Locator {
    return this.metricRows.filter({ hasText: metricName });
  }

  /**
   * Get status badge for a metric
   * @param metricName - Name of the metric
   */
  getMetricStatus(metricName: string): Locator {
    return this.getMetricRow(metricName).getByText(/^(PASS|FAIL)$/);
  }

  /**
   * Get severity badge for a metric
   * @param metricName - Name of the metric
   */
  getMetricSeverity(metricName: string): Locator {
    return this.getMetricRow(metricName).getByText(/^(Critical|Warning)$/);
  }

  /**
   * Get current value for a metric
   * @param metricName - Name of the metric
   */
  getMetricCurrentValue(metricName: string): Locator {
    return this.getMetricRow(metricName).locator('code').first();
  }

  /**
   * Get baseline value for a metric
   * @param metricName - Name of the metric
   */
  getMetricBaselineValue(metricName: string): Locator {
    return this.getMetricRow(metricName).locator('code').nth(1);
  }

  /**
   * Get delta value for a metric
   * @param metricName - Name of the metric
   */
  getMetricDelta(metricName: string): Locator {
    return this.getMetricRow(metricName).locator('code').nth(2);
  }

  /**
   * Get delta percentage for a metric
   * @param metricName - Name of the metric
   */
  getMetricDeltaPercent(metricName: string): Locator {
    return this.getMetricRow(metricName).locator('code').nth(3);
  }

  /**
   * Click the export JSON button and wait for download
   */
  async exportJson(): Promise<void> {
    const downloadPromise = this.page.waitForEvent('download');
    await this.exportJsonBtn.click();
    const download = await downloadPromise;
    return;
  }

  /**
   * Click the export HTML button and wait for download
   */
  async exportHtml(): Promise<void> {
    const downloadPromise = this.page.waitForEvent('download');
    await this.exportHtmlBtn.click();
    const download = await downloadPromise;
    return;
  }

  /**
   * Click back to run button
   */
  async clickBackToRun(): Promise<void> {
    await this.backToRunBtn.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Get all regressed metric badge texts
   */
  async getRegressedMetricNames(): Promise<string[]> {
    const badges = await this.regressedMetricBadges.all();
    return Promise.all(badges.map(badge => badge.textContent().then(text => text?.trim() || '')));
  }

  /**
   * Get metric count from regression alert
   */
  async getRegressedMetricCount(): Promise<number> {
    const alertText = await this.regressionAlert.textContent();
    const match = alertText?.match(/(\d+)\s+metric/i);
    return match ? parseInt(match[1], 10) : 0;
  }
}
