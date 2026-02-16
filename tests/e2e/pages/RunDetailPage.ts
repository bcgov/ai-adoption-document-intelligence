import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for Run Detail page
 * /benchmarking/projects/{projectId}/runs/{runId}
 */
export class RunDetailPage {
  readonly page: Page;

  // Header elements
  readonly runDefinitionName: Locator;
  readonly runIdText: Locator;
  readonly cancelRunBtn: Locator;
  readonly promoteBaselineBtn: Locator;
  readonly rerunBtn: Locator;
  readonly viewRegressionReportBtn: Locator;

  // Alerts
  readonly errorAlert: Locator;
  readonly baselineComparisonAlert: Locator;

  // Run information card
  readonly runInfoHeading: Locator;
  readonly runInfoTable: Locator;

  // Baseline comparison card
  readonly baselineComparisonHeading: Locator;
  readonly baselineComparisonTable: Locator;

  // Aggregated metrics card
  readonly aggregatedMetricsHeading: Locator;
  readonly aggregatedMetricsTable: Locator;

  // Parameters & tags card
  readonly paramsTagsHeading: Locator;
  readonly paramsTable: Locator;
  readonly tagsTable: Locator;

  // Artifacts card
  readonly artifactsHeading: Locator;
  readonly artifactTypeFilter: Locator;
  readonly artifactsTable: Locator;
  readonly artifactRows: Locator;

  // Drill-down summary card
  readonly drillDownHeading: Locator;
  readonly viewAllSamplesBtn: Locator;
  readonly worstSamplesTable: Locator;
  readonly fieldErrorBreakdownTable: Locator;
  readonly errorClustersTable: Locator;

  // Loading state
  readonly loadingSpinner: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header
    this.runDefinitionName = page.locator('[data-testid="run-definition-name"]');
    this.runIdText = page.locator('[data-testid="run-id-text"]');
    this.cancelRunBtn = page.locator('[data-testid="cancel-run-btn"]');
    this.promoteBaselineBtn = page.locator('[data-testid="promote-baseline-btn"]');
    this.rerunBtn = page.locator('[data-testid="rerun-btn"]');
    this.viewRegressionReportBtn = page.locator('[data-testid="view-regression-report-btn"]');

    // Alerts
    this.errorAlert = page.locator('[data-testid="run-error-alert"]');
    this.baselineComparisonAlert = page.locator('[data-testid="baseline-comparison-alert"]');

    // Run information
    this.runInfoHeading = page.locator('[data-testid="run-info-heading"]');
    this.runInfoTable = page.locator('[data-testid="run-info-table"]');

    // Baseline comparison
    this.baselineComparisonHeading = page.locator('[data-testid="baseline-comparison-heading"]');
    this.baselineComparisonTable = page.locator('[data-testid="baseline-comparison-table"]');

    // Aggregated metrics
    this.aggregatedMetricsHeading = page.locator('[data-testid="aggregated-metrics-heading"]');
    this.aggregatedMetricsTable = page.locator('[data-testid="aggregated-metrics-table"]');

    // Parameters & tags
    this.paramsTagsHeading = page.locator('[data-testid="params-tags-heading"]');
    this.paramsTable = page.locator('[data-testid="params-table"]');
    this.tagsTable = page.locator('[data-testid="tags-table"]');

    // Artifacts
    this.artifactsHeading = page.locator('[data-testid="artifacts-heading"]');
    this.artifactTypeFilter = page.locator('[data-testid="artifact-type-filter"]');
    this.artifactsTable = page.locator('[data-testid="artifacts-table"]');
    this.artifactRows = page.locator('[data-testid^="artifact-row-"]');

    // Drill-down summary
    this.drillDownHeading = page.locator('[data-testid="drill-down-heading"]');
    this.viewAllSamplesBtn = page.locator('[data-testid="view-all-samples-btn"]');
    this.worstSamplesTable = page.locator('[data-testid="worst-samples-table"]');
    this.fieldErrorBreakdownTable = page.locator('[data-testid="field-error-breakdown-table"]');
    this.errorClustersTable = page.locator('[data-testid="error-clusters-table"]');

    // Loading
    this.loadingSpinner = page.locator('role=generic >> role=generic[name="Loader"]');
  }

  /**
   * Navigate to this page directly
   * @param projectId - The ID of the project
   * @param runId - The ID of the run
   */
  async goto(projectId: string, runId: string) {
    await this.page.goto(`/benchmarking/projects/${projectId}/runs/${runId}`);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Get the status badge
   */
  getStatusBadge(): Locator {
    return this.runInfoTable.locator('[class*="Badge"]').first();
  }

  /**
   * Get the status text from run info table
   */
  getStatusText(): Locator {
    return this.runInfoTable.locator('text=/Status/').locator('xpath=..').locator('td').nth(1);
  }

  /**
   * Get the duration text from run info table
   */
  getDuration(): Locator {
    return this.runInfoTable.locator('text=/Duration/').locator('xpath=..').locator('td').nth(1);
  }

  /**
   * Get the MLflow Run link
   */
  getMlflowLink(): Locator {
    return this.runInfoTable.locator('a[href*="mlflow"]');
  }

  /**
   * Get the Temporal Workflow link
   */
  getTemporalLink(): Locator {
    return this.runInfoTable.locator('a[href*="temporal"]');
  }

  /**
   * Click the cancel button
   */
  async clickCancel() {
    await this.cancelRunBtn.click();
  }

  /**
   * Click the re-run button
   */
  async clickRerun() {
    await this.rerunBtn.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Wait for status to change from current status
   * Useful for polling scenarios
   */
  async waitForStatusChange(fromStatus: string, timeoutMs: number = 30000) {
    await this.page.waitForFunction(
      (status) => {
        const statusElement = document.querySelector('[data-testid="run-info-table"]');
        return statusElement && !statusElement.textContent?.includes(status);
      },
      fromStatus,
      { timeout: timeoutMs }
    );
  }
}
