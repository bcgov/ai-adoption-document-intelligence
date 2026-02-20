import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for Project Detail page
 * /benchmarking/projects/{projectId}
 */
export class ProjectDetailPage {
  readonly page: Page;

  // Header elements
  readonly projectNameTitle: Locator;
  readonly projectDescription: Locator;
  readonly mlflowExperimentId: Locator;

  // Definitions section
  readonly definitionsHeading: Locator;
  readonly createDefinitionBtn: Locator;
  readonly definitionsTable: Locator;
  readonly definitionRows: Locator;
  readonly noDefinitionsMessage: Locator;

  // Runs section
  readonly runsHeading: Locator;
  readonly compareRunsBtn: Locator;
  readonly runsTable: Locator;
  readonly runRows: Locator;
  readonly noRunsMessage: Locator;

  // Loading state
  readonly loadingSpinner: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header
    this.projectNameTitle = page.locator('[data-testid="project-name-title"]');
    this.projectDescription = page.locator('[data-testid="project-description"]');
    this.mlflowExperimentId = page.locator('[data-testid="mlflow-experiment-id"]');

    // Definitions section
    this.definitionsHeading = page.locator('[data-testid="definitions-heading"]');
    this.createDefinitionBtn = page.locator('[data-testid="create-definition-btn"]');
    this.definitionsTable = page.locator('[data-testid="definitions-table"]');
    this.definitionRows = page.locator('[data-testid^="definition-row-"]');
    this.noDefinitionsMessage = page.locator('[data-testid="no-definitions-message"]');

    // Runs section
    this.runsHeading = page.locator('[data-testid="runs-heading"]');
    this.compareRunsBtn = page.locator('[data-testid="compare-runs-btn"]');
    this.runsTable = page.locator('[data-testid="runs-table"]');
    this.runRows = page.locator('[data-testid^="run-row-"]');
    this.noRunsMessage = page.locator('[data-testid="no-runs-message"]');

    // Loading
    this.loadingSpinner = page.locator('role=generic >> role=generic[name="Loader"]');
  }

  /**
   * Navigate to this page directly
   * @param projectId - The ID of the project
   */
  async goto(projectId: string) {
    await this.page.goto(`/benchmarking/projects/${projectId}`);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Click on a run row to view details
   * @param runId - The ID of the run to click
   */
  async clickRun(runId: string) {
    const row = this.page.locator(`[data-testid="run-row-${runId}"]`);
    // Click somewhere other than the checkbox
    await row.locator('td').nth(1).click(); // Click the second cell (status)
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Click the first run in the list
   */
  async clickFirstRun() {
    // Click the second cell to avoid the checkbox
    await this.runRows.first().locator('td').nth(1).click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Get run row by ID
   */
  getRunRow(runId: string): Locator {
    return this.page.locator(`[data-testid="run-row-${runId}"]`);
  }

  /**
   * Get run checkbox by ID
   */
  getRunCheckbox(runId: string): Locator {
    return this.page.locator(`[data-testid="run-checkbox-${runId}"]`);
  }

  /**
   * Click the create definition button
   */
  async clickCreateDefinition() {
    await this.createDefinitionBtn.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Click on a definition row to view details
   * @param definitionId - The ID of the definition to click
   */
  async clickDefinition(definitionId: string) {
    const row = this.page.locator(`[data-testid="definition-row-${definitionId}"]`);
    await row.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Get definition row by ID
   */
  getDefinitionRow(definitionId: string): Locator {
    return this.page.locator(`[data-testid="definition-row-${definitionId}"]`);
  }

  /**
   * Get definition row by name
   */
  getDefinitionRowByName(definitionName: string): Locator {
    return this.definitionRows.filter({ hasText: definitionName });
  }

  /**
   * Get status badge for a run
   * @param runId - The ID of the run
   */
  getRunStatusBadge(runId: string): Locator {
    return this.getRunRow(runId).locator('[class*="Badge"]').first();
  }

  /**
   * Get duration/elapsed time for a run
   * @param runId - The ID of the run
   */
  getRunDuration(runId: string): Locator {
    return this.getRunRow(runId).locator('td').nth(4); // Duration is typically the 5th column
  }

  /**
   * Get headline metrics for a run
   * @param runId - The ID of the run
   */
  getRunMetrics(runId: string): Locator {
    return this.getRunRow(runId).locator('td').nth(5); // Metrics are typically the 6th column
  }

  /**
   * Select multiple runs for comparison
   * @param runIds - Array of run IDs to select
   */
  async selectRunsForComparison(runIds: string[]) {
    for (const runId of runIds) {
      await this.getRunCheckbox(runId).check();
    }
  }

  /**
   * Click the compare runs button
   */
  async clickCompareRuns() {
    await this.compareRunsBtn.click();
    await this.page.waitForLoadState('networkidle');
  }
}
