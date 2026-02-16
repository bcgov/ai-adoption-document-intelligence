import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for Datasets List page
 * /benchmarking/datasets
 */
export class DatasetsListPage {
  readonly page: Page;

  // Header elements
  readonly header: Locator;
  readonly pageTitle: Locator;
  readonly createDatasetBtn: Locator;

  // Empty state
  readonly emptyStateContainer: Locator;
  readonly emptyStateTitle: Locator;
  readonly createDatasetEmptyBtn: Locator;

  // Table elements
  readonly datasetsTable: Locator;
  readonly datasetRows: Locator;

  // Loading state
  readonly loadingSpinner: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header
    this.header = page.locator('[data-testid="datasets-header"]');
    this.pageTitle = page.getByRole('heading', { name: 'Datasets', level: 2 });
    this.createDatasetBtn = page.locator('[data-testid="create-dataset-btn"]');

    // Empty state
    this.emptyStateContainer = page.locator('[data-testid="datasets-empty-state"]');
    this.emptyStateTitle = page.getByText('No datasets yet');
    this.createDatasetEmptyBtn = page.locator('[data-testid="create-dataset-empty-btn"]');

    // Table
    this.datasetsTable = page.locator('[data-testid="datasets-table"]');
    this.datasetRows = page.locator('[data-testid^="dataset-row-"]');

    // Loading
    this.loadingSpinner = page.locator('role=generic >> role=generic[name="Loader"]');
  }

  /**
   * Navigate to this page from anywhere in the app
   */
  async goto() {
    await this.page.goto('/benchmarking/datasets');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Click on a dataset row to view details
   * @param datasetId - The ID of the dataset to click
   */
  async clickDataset(datasetId: string) {
    const row = this.page.locator(`[data-testid="dataset-row-${datasetId}"]`);
    await row.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Click on the first dataset in the list
   */
  async clickFirstDataset() {
    await this.datasetRows.first().click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Get dataset row by ID
   */
  getDatasetRow(datasetId: string): Locator {
    return this.page.locator(`[data-testid="dataset-row-${datasetId}"]`);
  }
}
