import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for the Validation Report component
 * Displayed in a modal dialog after triggering dataset validation
 */
export class ValidationReportComponent {
  readonly page: Page;

  // Overall status card
  readonly statusCard: Locator;
  readonly resultTitle: Locator;
  readonly sampleInfo: Locator;
  readonly statusBadge: Locator;

  // Issue summary table
  readonly issueSummaryCard: Locator;
  readonly issueSummaryTitle: Locator;
  readonly issueSummaryTable: Locator;
  readonly schemaViolationsRow: Locator;
  readonly schemaViolationsCount: Locator;
  readonly missingGroundTruthRow: Locator;
  readonly missingGroundTruthCount: Locator;
  readonly duplicatesRow: Locator;
  readonly duplicatesCount: Locator;
  readonly corruptionRow: Locator;
  readonly corruptionCount: Locator;
  readonly totalIssuesRow: Locator;
  readonly totalIssuesCount: Locator;

  // Detailed issues list
  readonly detailedIssuesCard: Locator;
  readonly detailedIssuesTitle: Locator;
  readonly issuesList: Locator;

  // Loading and error states
  readonly loadingIndicator: Locator;
  readonly noResultsMessage: Locator;

  constructor(page: Page) {
    this.page = page;

    // Overall status
    this.statusCard = page.locator('[data-testid="validation-status-card"]');
    this.resultTitle = page.locator('[data-testid="validation-result-title"]');
    this.sampleInfo = page.locator('[data-testid="validation-sample-info"]');
    this.statusBadge = page.locator('[data-testid="validation-status-badge"]');

    // Issue summary
    this.issueSummaryCard = page.locator('[data-testid="validation-issue-summary-card"]');
    this.issueSummaryTitle = page.locator('[data-testid="issue-summary-title"]');
    this.issueSummaryTable = page.locator('[data-testid="issue-summary-table"]');
    this.schemaViolationsRow = page.locator('[data-testid="schema-violations-row"]');
    this.schemaViolationsCount = page.locator('[data-testid="schema-violations-count"]');
    this.missingGroundTruthRow = page.locator('[data-testid="missing-ground-truth-row"]');
    this.missingGroundTruthCount = page.locator('[data-testid="missing-ground-truth-count"]');
    this.duplicatesRow = page.locator('[data-testid="duplicates-row"]');
    this.duplicatesCount = page.locator('[data-testid="duplicates-count"]');
    this.corruptionRow = page.locator('[data-testid="corruption-row"]');
    this.corruptionCount = page.locator('[data-testid="corruption-count"]');
    this.totalIssuesRow = page.locator('[data-testid="total-issues-row"]');
    this.totalIssuesCount = page.locator('[data-testid="total-issues-count"]');

    // Detailed issues
    this.detailedIssuesCard = page.locator('[data-testid="validation-detailed-issues-card"]');
    this.detailedIssuesTitle = page.locator('[data-testid="detailed-issues-title"]');
    this.issuesList = page.locator('[data-testid="issues-list"]');

    // Loading/error states
    this.loadingIndicator = page.getByRole('generic').filter({ has: page.getByText('Loader', { exact: false }) }).or(page.locator('.mantine-Loader-root'));
    this.noResultsMessage = page.getByText('No validation results available');
  }

  /**
   * Wait for validation to complete
   * @param timeout - Maximum time to wait (default 30s)
   */
  async waitForValidationComplete(timeout: number = 30000) {
    // Wait for either the status card or the no results message to appear
    try {
      await this.statusCard.waitFor({ state: 'visible', timeout });
    } catch {
      // If status card doesn't appear, check if no results message is shown
      await this.noResultsMessage.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {
        // Neither appeared, which is an error state
      });
    }
    // Small delay for UI to settle
    await this.page.waitForTimeout(200);
  }

  /**
   * Get an issue card by index
   * @param index - Zero-based index of the issue
   */
  getIssueCard(index: number): Locator {
    return this.page.locator(`[data-testid="issue-card-${index}"]`);
  }

  /**
   * Get the sample ID for an issue
   * @param index - Zero-based index of the issue
   */
  getIssueSampleId(index: number): Locator {
    return this.page.locator(`[data-testid="issue-sample-id-${index}"]`);
  }

  /**
   * Get the category badge for an issue
   * @param index - Zero-based index of the issue
   */
  getIssueCategory(index: number): Locator {
    return this.page.locator(`[data-testid="issue-category-${index}"]`);
  }

  /**
   * Get the severity badge for an issue
   * @param index - Zero-based index of the issue
   */
  getIssueSeverity(index: number): Locator {
    return this.page.locator(`[data-testid="issue-severity-${index}"]`);
  }

  /**
   * Get the message for an issue
   * @param index - Zero-based index of the issue
   */
  getIssueMessage(index: number): Locator {
    return this.page.locator(`[data-testid="issue-message-${index}"]`);
  }

  /**
   * Get the file path for an issue
   * @param index - Zero-based index of the issue
   */
  getIssueFilePath(index: number): Locator {
    return this.page.locator(`[data-testid="issue-file-path-${index}"]`);
  }

  /**
   * Get the details for an issue
   * @param index - Zero-based index of the issue
   */
  getIssueDetails(index: number): Locator {
    return this.page.locator(`[data-testid="issue-details-${index}"]`);
  }

  /**
   * Check if the validation passed (no errors)
   */
  async isValidationPassed(): Promise<boolean> {
    const badgeText = await this.statusBadge.textContent();
    return badgeText?.toLowerCase().includes('valid') || false;
  }

  /**
   * Get the count of issues for a specific category
   * @param category - The category (schema-violations, missing-ground-truth, duplicates, corruption, total)
   */
  async getIssueCount(category: 'schema-violations' | 'missing-ground-truth' | 'duplicates' | 'corruption' | 'total'): Promise<number> {
    let countLocator: Locator;

    switch (category) {
      case 'schema-violations':
        countLocator = this.schemaViolationsCount;
        break;
      case 'missing-ground-truth':
        countLocator = this.missingGroundTruthCount;
        break;
      case 'duplicates':
        countLocator = this.duplicatesCount;
        break;
      case 'corruption':
        countLocator = this.corruptionCount;
        break;
      case 'total':
        countLocator = this.totalIssuesCount;
        break;
    }

    const text = await countLocator.textContent();
    const match = text?.match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  }

  /**
   * Get the total number of detailed issues listed
   */
  async getDetailedIssueCount(): Promise<number> {
    const issues = this.page.locator('[data-testid^="issue-card-"]');
    return await issues.count();
  }
}
