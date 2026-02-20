import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for Run Comparison page
 * /benchmarking/projects/{projectId}/compare?runs=runId1,runId2,...
 */
export class RunComparisonPage {
  readonly page: Page;

  // Header section
  readonly comparisonTitle: Locator;
  readonly runCountText: Locator;
  readonly exportCsvBtn: Locator;
  readonly exportJsonBtn: Locator;
  readonly backToProjectBtn: Locator;

  // Run information section
  readonly runInfoCard: Locator;
  readonly runInfoTable: Locator;

  // Metrics comparison section
  readonly metricsComparisonCard: Locator;
  readonly metricsComparisonTable: Locator;
  readonly metricRows: Locator;

  // Parameters comparison section
  readonly parametersComparisonCard: Locator;
  readonly parametersComparisonTable: Locator;

  // Tags comparison section
  readonly tagsComparisonCard: Locator;
  readonly tagsComparisonTable: Locator;

  // Empty states
  readonly noRunsSelectedMessage: Locator;
  readonly noRunsFoundMessage: Locator;

  // Loading state
  readonly loadingSpinner: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header
    this.comparisonTitle = page.locator('[data-testid="comparison-title"]');
    this.runCountText = page.locator('text=/Comparing \\d+ runs?/');
    this.exportCsvBtn = page.locator('[data-testid="export-csv-btn"]');
    this.exportJsonBtn = page.locator('[data-testid="export-json-btn"]');
    this.backToProjectBtn = page.locator('[data-testid="back-to-project-btn"]');

    // Run information
    this.runInfoCard = page.locator('[data-testid="run-info-card"]');
    this.runInfoTable = page.locator('[data-testid="run-info-table"]');

    // Metrics comparison
    this.metricsComparisonCard = page.locator('[data-testid="metrics-comparison-card"]');
    this.metricsComparisonTable = page.locator('[data-testid="metrics-comparison-table"]');
    this.metricRows = this.metricsComparisonTable.locator('tbody tr');

    // Parameters comparison
    this.parametersComparisonCard = page.locator('[data-testid="parameters-comparison-card"]');
    this.parametersComparisonTable = page.locator('[data-testid="parameters-comparison-table"]');

    // Tags comparison
    this.tagsComparisonCard = page.locator('[data-testid="tags-comparison-card"]');
    this.tagsComparisonTable = page.locator('[data-testid="tags-comparison-table"]');

    // Empty states
    this.noRunsSelectedMessage = page.locator('text=No runs selected for comparison');
    this.noRunsFoundMessage = page.locator('text=No runs found');

    // Loading
    this.loadingSpinner = page.locator('[role="progressbar"]');
  }

  /**
   * Navigate to comparison page directly
   * @param projectId - The project ID
   * @param runIds - Array of run IDs to compare
   */
  async goto(projectId: string, runIds: string[]) {
    const runIdsParam = runIds.join(',');
    await this.page.goto(`/benchmarking/projects/${projectId}/compare?runs=${runIdsParam}`);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Get run header link by run ID
   * @param runId - The run ID
   */
  getRunHeaderLink(runId: string): Locator {
    return this.page.locator(`[data-testid="run-header-link-${runId}"]`);
  }

  /**
   * Get metrics run header link by run ID
   * @param runId - The run ID
   */
  getMetricsRunHeaderLink(runId: string): Locator {
    return this.page.locator(`[data-testid="metrics-run-header-link-${runId}"]`);
  }

  /**
   * Get baseline badge by run ID
   * @param runId - The run ID
   */
  getBaselineBadge(runId: string): Locator {
    return this.page.locator(`[data-testid="baseline-badge-${runId}"]`);
  }

  /**
   * Get metrics baseline badge by run ID
   * @param runId - The run ID
   */
  getMetricsBaselineBadge(runId: string): Locator {
    return this.page.locator(`[data-testid="metrics-baseline-badge-${runId}"]`);
  }

  /**
   * Get metric row by metric name
   * @param metricName - The name of the metric
   */
  getMetricRow(metricName: string): Locator {
    return this.metricRows.filter({ hasText: metricName });
  }

  /**
   * Get positive delta indicators (green)
   */
  getPositiveDeltas(): Locator {
    return this.metricsComparisonTable.locator('code[color="green"]');
  }

  /**
   * Get negative delta indicators (red)
   */
  getNegativeDeltas(): Locator {
    return this.metricsComparisonTable.locator('code[color="red"]');
  }

  /**
   * Get changed parameter badges
   */
  getChangedParameterBadges(): Locator {
    return this.parametersComparisonCard.locator('badge:has-text("Changed")');
  }

  /**
   * Get changed tag badges
   */
  getChangedTagBadges(): Locator {
    return this.tagsComparisonCard.locator('badge:has-text("Changed")');
  }

  /**
   * Export comparison as CSV
   */
  async exportCsv() {
    const downloadPromise = this.page.waitForEvent('download');
    await this.exportCsvBtn.click();
    const download = await downloadPromise;
    return download;
  }

  /**
   * Export comparison as JSON
   */
  async exportJson() {
    const downloadPromise = this.page.waitForEvent('download');
    await this.exportJsonBtn.click();
    const download = await downloadPromise;
    return download;
  }

  /**
   * Click back to project button
   */
  async clickBackToProject() {
    await this.backToProjectBtn.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Get status badge from run info table
   * @param runId - The run ID (to identify the column)
   */
  getStatusBadge(runId: string): Locator {
    return this.runInfoCard.locator('badge').first();
  }

  /**
   * Get parameter row by name
   * @param paramName - The parameter name
   */
  getParameterRow(paramName: string): Locator {
    return this.parametersComparisonTable.locator('tr').filter({ hasText: paramName });
  }

  /**
   * Get tag row by name
   * @param tagName - The tag name
   */
  getTagRow(tagName: string): Locator {
    return this.tagsComparisonTable.locator('tr').filter({ hasText: tagName });
  }

  /**
   * Wait for comparison data to load
   */
  async waitForDataLoad() {
    await this.loadingSpinner.waitFor({ state: 'hidden', timeout: 10000 });
    await this.page.waitForLoadState('networkidle');
  }
}
