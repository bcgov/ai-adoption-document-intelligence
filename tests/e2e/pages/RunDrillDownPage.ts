import { Page, Locator } from '@playwright/test';

export class RunDrillDownPage {
  readonly page: Page;

  // Navigation
  readonly backToRunDetailsButton: Locator;

  // Filter Panel
  readonly activeFilterCount: Locator;
  readonly clearAllFiltersButton: Locator;
  readonly filterDocType: Locator;
  readonly filterLanguage: Locator;
  readonly filterSource: Locator;
  readonly filterPageCount: Locator;
  readonly filterCustomField: Locator;

  // Results Summary
  readonly sampleCount: Locator;
  readonly topPagination: Locator;
  readonly bottomPagination: Locator;

  // Results Table
  readonly samplesTable: Locator;
  readonly emptyResultsAlert: Locator;

  // Sample Detail Drawer
  readonly sampleDetailDrawer: Locator;
  readonly drawerCloseButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Navigation
    this.backToRunDetailsButton = page.locator('[data-testid="back-to-run-details-btn"]');

    // Filter Panel
    this.activeFilterCount = page.locator('[data-testid="active-filter-count"]');
    this.clearAllFiltersButton = page.locator('[data-testid="clear-all-filters-btn"]');
    this.filterDocType = page.locator('[data-testid="filter-docType"]');
    this.filterLanguage = page.locator('[data-testid="filter-language"]');
    this.filterSource = page.locator('[data-testid="filter-source"]');
    this.filterPageCount = page.locator('[data-testid="filter-pageCount"]');
    this.filterCustomField = page.locator('[data-testid="filter-customField"]');

    // Results Summary
    this.sampleCount = page.locator('[data-testid="sample-count"]');
    this.topPagination = page.locator('[data-testid="top-pagination"]');
    this.bottomPagination = page.locator('[data-testid="bottom-pagination"]');

    // Results Table
    this.samplesTable = page.locator('[data-testid="samples-table"]');
    this.emptyResultsAlert = page.locator('[data-testid="empty-results-alert"]');

    // Sample Detail Drawer
    this.sampleDetailDrawer = page.locator('[data-testid="sample-detail-drawer"]');
    this.drawerCloseButton = page.locator('button[aria-label="Close"]');
  }

  /**
   * Navigate to the drill-down page for a specific run
   */
  async goto(projectId: string, runId: string) {
    await this.page.goto(`/benchmarking/projects/${projectId}/runs/${runId}/drill-down`);
    await this.page.waitForLoadState('networkidle');
    // Wait for the table to be visible (ensures React has rendered)
    await this.samplesTable.waitFor({ state: 'visible', timeout: 10000 });
    // Additional small wait for React event handlers to be attached
    await this.page.waitForTimeout(500);
  }

  /**
   * Apply a filter by selecting a value from a dropdown
   */
  async applyFilter(filterName: string, value: string) {
    const filterLocator = this.getFilterLocator(filterName);
    await filterLocator.click();
    await this.page.getByRole('option', { name: value }).click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Clear a specific filter
   */
  async clearFilter(filterName: string) {
    const filterLocator = this.getFilterLocator(filterName);
    const clearButton = filterLocator.locator('[aria-label="Clear selection"]');
    await clearButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Clear all active filters
   */
  async clearAllFilters() {
    await this.clearAllFiltersButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Open sample detail drawer by clicking on a sample row
   */
  async openSampleDetail(sampleId: string) {
    // Use getByTestId for more reliable element selection
    const viewButton = this.page.getByTestId(`view-sample-${sampleId}`);

    // Verify button exists and is visible
    await viewButton.waitFor({ state: 'visible', timeout: 5000 });

    // Click to open the drawer
    await viewButton.click({ force: true });

    // Wait for the dialog/modal to appear (Mantine Drawer uses role="dialog")
    await this.page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 10000 });
  }

  /**
   * Close the sample detail drawer
   */
  async closeSampleDetail() {
    // Click the close button in the dialog
    const closeButton = this.page.locator('[role="dialog"] button[aria-label="Close"], [role="dialog"] .mantine-Drawer-close');
    await closeButton.click();
    // Wait for dialog to disappear
    await this.page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 5000 });
  }

  /**
   * Get the count of visible rows in the samples table
   */
  async getSampleRowCount(): Promise<number> {
    const rows = this.samplesTable.locator('tbody tr');
    return await rows.count();
  }

  /**
   * Get filter locator by name
   */
  private getFilterLocator(filterName: string): Locator {
    switch (filterName.toLowerCase()) {
      case 'doctype':
        return this.filterDocType;
      case 'language':
        return this.filterLanguage;
      case 'source':
        return this.filterSource;
      case 'pagecount':
        return this.filterPageCount;
      case 'customfield':
        return this.filterCustomField;
      default:
        throw new Error(`Unknown filter: ${filterName}`);
    }
  }

  /**
   * Navigate to next page
   */
  async goToNextPage() {
    const nextButton = this.bottomPagination.getByRole('button', { name: /next/i });
    await nextButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Navigate to previous page
   */
  async goToPreviousPage() {
    const prevButton = this.bottomPagination.getByRole('button', { name: /previous/i });
    await prevButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Get the sample count text (e.g., "Showing 20 of 50 samples")
   */
  async getSampleCountText(): Promise<string> {
    return await this.sampleCount.textContent() || '';
  }

  /**
   * Check if a specific sample ID is visible in the table
   */
  async isSampleVisible(sampleId: string): Promise<boolean> {
    const sampleCell = this.samplesTable.locator('td', { hasText: sampleId });
    return await sampleCell.isVisible();
  }
}
