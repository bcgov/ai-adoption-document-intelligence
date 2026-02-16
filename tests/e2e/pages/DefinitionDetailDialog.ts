import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for Definition Detail Dialog
 * Opened from project detail page when clicking on a definition
 */
export class DefinitionDetailDialog {
  readonly page: Page;

  // Dialog
  readonly dialogTitle: Locator;
  readonly closeBtn: Locator;

  // Header
  readonly definitionName: Locator;
  readonly startRunBtn: Locator;
  readonly revisionBadge: Locator;

  // Configuration table
  readonly configTable: Locator;
  readonly datasetVersionRow: Locator;
  readonly splitRow: Locator;
  readonly workflowRow: Locator;
  readonly workflowHashRow: Locator;
  readonly evaluatorTypeRow: Locator;
  readonly configHashCode: Locator;

  // Configuration sections
  readonly evaluatorConfigHeading: Locator;
  readonly evaluatorConfigJson: Locator;
  readonly runtimeSettingsHeading: Locator;
  readonly runtimeSettingsJson: Locator;
  readonly artifactPolicyHeading: Locator;
  readonly artifactPolicyJson: Locator;

  // Schedule section
  readonly scheduleHeading: Locator;
  readonly scheduleToggle: Locator;
  readonly saveScheduleBtn: Locator;

  // Run history
  readonly runHistoryHeading: Locator;
  readonly runHistoryTable: Locator;
  readonly mlflowRunIds: Locator;

  constructor(page: Page) {
    this.page = page;

    // Dialog
    this.dialogTitle = page.getByRole('heading', { level: 2, name: 'Definition Details' });
    this.closeBtn = page.locator('button').filter({ has: page.locator('img') }).first();

    // Header
    // Use a more specific selector - the first h3 inside the dialog after the dialog title
    this.definitionName = page.locator('[role="dialog"]').getByRole('heading', { level: 3 }).first();
    this.startRunBtn = page.locator('[data-testid="start-run-btn"]');
    this.revisionBadge = page.locator('text=/Revision \\d+/');

    // Configuration table
    this.configTable = page.locator('[role="dialog"]').locator('table').first();
    // Use tbody to target data rows, not header rows
    this.datasetVersionRow = page.locator('[role="dialog"] tbody tr:has-text("Dataset Version")');
    this.splitRow = page.locator('[role="dialog"] tbody tr:has-text("Split")');
    this.workflowRow = page.locator('[role="dialog"] tbody tr:has-text("Workflow")').first();
    this.workflowHashRow = page.locator('[role="dialog"] tbody tr:has-text("Workflow Config Hash")');
    this.evaluatorTypeRow = page.locator('[role="dialog"] tbody tr:has-text("Evaluator Type")');
    this.configHashCode = page.locator('[role="dialog"] code');

    // Configuration sections
    this.evaluatorConfigHeading = page.getByRole('heading', { level: 4, name: 'Evaluator Configuration' });
    this.evaluatorConfigJson = page.locator('pre').first();
    this.runtimeSettingsHeading = page.getByRole('heading', { level: 4, name: 'Runtime Settings' });
    this.runtimeSettingsJson = page.locator('pre').nth(1);
    this.artifactPolicyHeading = page.getByRole('heading', { level: 4, name: 'Artifact Policy' });
    this.artifactPolicyJson = page.locator('pre').nth(2);

    // Schedule section
    this.scheduleHeading = page.getByRole('heading', { level: 4, name: 'Schedule Configuration' });
    this.scheduleToggle = page.locator('input[type="checkbox"]').first();
    this.saveScheduleBtn = page.getByRole('button', { name: 'Save Schedule' });

    // Run history
    this.runHistoryHeading = page.getByRole('heading', { level: 4, name: 'Run History' });
    this.runHistoryTable = page.locator('table').nth(1);
    this.mlflowRunIds = page.locator('code');
  }

  async waitForDialogToOpen() {
    await this.dialogTitle.waitFor({ state: 'visible' });
  }

  async close() {
    await this.closeBtn.click();
  }

  async getConfigurationValue(rowName: string): Promise<string> {
    const row = this.page.locator(`tr:has-text("${rowName}")`);
    const cells = row.locator('td');
    const value = await cells.nth(1).textContent();
    return value || '';
  }
}
