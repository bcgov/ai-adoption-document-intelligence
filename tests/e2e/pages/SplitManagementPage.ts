import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for Split Management UI
 * Accessible via Dataset Detail page → Select version → Splits tab
 */
export class SplitManagementPage {
  readonly page: Page;

  // Header elements
  readonly splitsTitle: Locator;
  readonly createSplitBtn: Locator;

  // Splits table
  readonly splitsTableCard: Locator;
  readonly splitsTable: Locator;
  readonly splitRows: Locator;

  // Empty state
  readonly splitsEmptyState: Locator;
  readonly noSplitsMessage: Locator;
  readonly createFirstSplitBtn: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header
    this.splitsTitle = page.locator('[data-testid="splits-title"]');
    this.createSplitBtn = page.locator('[data-testid="create-split-btn"]');

    // Table
    this.splitsTableCard = page.locator('[data-testid="splits-table-card"]');
    this.splitsTable = page.locator('[data-testid="splits-table"]');
    this.splitRows = page.locator('[data-testid^="split-row-"]');

    // Empty state
    this.splitsEmptyState = page.locator('[data-testid="splits-empty-state"]');
    this.noSplitsMessage = page.locator('[data-testid="no-splits-message"]');
    this.createFirstSplitBtn = page.locator('[data-testid="create-first-split-btn"]');
  }

  /**
   * Get split row locator by split ID
   * @param splitId - The ID of the split
   */
  getSplitRow(splitId: string): Locator {
    return this.page.locator(`[data-testid="split-row-${splitId}"]`);
  }

  /**
   * Get split name locator by split ID
   * @param splitId - The ID of the split
   */
  getSplitName(splitId: string): Locator {
    return this.page.locator(`[data-testid="split-name-${splitId}"]`);
  }

  /**
   * Get split type badge by split ID
   * @param splitId - The ID of the split
   */
  getSplitTypeBadge(splitId: string): Locator {
    return this.page.locator(`[data-testid="split-type-badge-${splitId}"]`);
  }

  /**
   * Get split sample count by split ID
   * @param splitId - The ID of the split
   */
  getSplitSampleCount(splitId: string): Locator {
    return this.page.locator(`[data-testid="split-sample-count-${splitId}"]`);
  }

  /**
   * Get split status badge by split ID
   * @param splitId - The ID of the split
   */
  getSplitStatusBadge(splitId: string): Locator {
    return this.page.locator(`[data-testid="split-status-badge-${splitId}"]`);
  }

  /**
   * Get split created date by split ID
   * @param splitId - The ID of the split
   */
  getSplitCreatedDate(splitId: string): Locator {
    return this.page.locator(`[data-testid="split-created-${splitId}"]`);
  }

  /**
   * Get edit split button by split ID (only visible for unfrozen splits)
   * @param splitId - The ID of the split
   */
  getEditSplitBtn(splitId: string): Locator {
    return this.page.locator(`[data-testid="edit-split-btn-${splitId}"]`);
  }

  /**
   * Get freeze split button by split ID (only visible for unfrozen golden splits)
   * @param splitId - The ID of the split
   */
  getFreezeSplitBtn(splitId: string): Locator {
    return this.page.locator(`[data-testid="freeze-split-btn-${splitId}"]`);
  }

  /**
   * Open create split dialog
   */
  async openCreateDialog() {
    await this.createSplitBtn.click();
  }

  /**
   * Open create split dialog from empty state
   */
  async openCreateDialogFromEmptyState() {
    await this.createFirstSplitBtn.click();
  }

  /**
   * Click edit button for a split
   * @param splitId - The ID of the split to edit
   */
  async clickEditSplit(splitId: string) {
    await this.getEditSplitBtn(splitId).click();
  }

  /**
   * Click freeze button for a split
   * @param splitId - The ID of the split to freeze
   */
  async clickFreezeSplit(splitId: string) {
    await this.getFreezeSplitBtn(splitId).click();
  }

  /**
   * Get count of visible split rows
   */
  async getSplitCount(): Promise<number> {
    return await this.splitRows.count();
  }

  /**
   * Check if splits table is displayed
   */
  async isTableDisplayed(): Promise<boolean> {
    return await this.splitsTable.isVisible();
  }

  /**
   * Check if empty state is displayed
   */
  async isEmptyStateDisplayed(): Promise<boolean> {
    return await this.splitsEmptyState.isVisible();
  }
}
