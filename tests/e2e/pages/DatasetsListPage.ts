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

  // Create Dataset Dialog
  readonly createDatasetDialog: Locator;
  readonly dialogTitle: Locator;
  readonly dialogCloseBtn: Locator;

  // Dialog form fields
  readonly datasetNameInput: Locator;
  readonly datasetDescriptionInput: Locator;
  readonly datasetRepositoryUrlInput: Locator;

  // Metadata section
  readonly metadataSection: Locator;
  readonly metadataKeyInput: Locator;
  readonly metadataValueInput: Locator;
  readonly addMetadataBtn: Locator;

  // Dialog actions
  readonly cancelDatasetBtn: Locator;
  readonly submitDatasetBtn: Locator;

  // Error messages
  readonly nameErrorMessage: Locator;
  readonly repositoryUrlErrorMessage: Locator;

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

    // Create Dataset Dialog
    this.createDatasetDialog = page.locator('[data-testid="create-dataset-dialog"]');
    this.dialogTitle = page.getByRole('heading', { name: 'Create New Dataset' });
    // Mantine Modal close button - the button in the header/banner without text
    this.dialogCloseBtn = this.createDatasetDialog.getByRole('banner').getByRole('button').first();

    // Dialog form fields
    this.datasetNameInput = page.locator('[data-testid="dataset-name-input"]');
    this.datasetDescriptionInput = page.locator('[data-testid="dataset-description-input"]');
    this.datasetRepositoryUrlInput = page.locator('[data-testid="dataset-repository-url-input"]');

    // Metadata section
    this.metadataSection = page.locator('[data-testid="dataset-metadata-section"]');
    this.metadataKeyInput = page.locator('[data-testid="metadata-key-input"]');
    this.metadataValueInput = page.locator('[data-testid="metadata-value-input"]');
    this.addMetadataBtn = page.locator('[data-testid="add-metadata-btn"]');

    // Dialog actions
    this.cancelDatasetBtn = page.locator('[data-testid="cancel-dataset-btn"]');
    this.submitDatasetBtn = page.locator('[data-testid="submit-dataset-btn"]');

    // Error messages
    this.nameErrorMessage = page.getByText('Dataset name is required');
    this.repositoryUrlErrorMessage = page.getByText('Repository URL is required');
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

  /**
   * Open the create dataset dialog by clicking the header button
   */
  async openCreateDialog() {
    await this.createDatasetBtn.click();
    // Wait for the dialog title to be visible (more reliable than waiting for the modal wrapper)
    await this.dialogTitle.waitFor({ state: 'visible' });
    // Also wait for the name input to be ready for interaction
    await this.datasetNameInput.waitFor({ state: 'visible' });
  }

  /**
   * Open the create dataset dialog from empty state
   */
  async openCreateDialogFromEmptyState() {
    await this.createDatasetEmptyBtn.click();
    // Wait for the dialog title to be visible
    await this.dialogTitle.waitFor({ state: 'visible' });
    await this.datasetNameInput.waitFor({ state: 'visible' });
  }

  /**
   * Fill in the create dataset form
   */
  async fillDatasetForm(data: {
    name: string;
    description?: string;
    repositoryUrl: string;
    metadata?: Record<string, string>;
  }) {
    await this.datasetNameInput.fill(data.name);

    if (data.description) {
      await this.datasetDescriptionInput.fill(data.description);
    }

    await this.datasetRepositoryUrlInput.fill(data.repositoryUrl);

    if (data.metadata) {
      for (const [key, value] of Object.entries(data.metadata)) {
        await this.addMetadata(key, value);
      }
    }
  }

  /**
   * Add a metadata key-value pair
   */
  async addMetadata(key: string, value: string) {
    await this.metadataKeyInput.fill(key);
    await this.metadataValueInput.fill(value);
    await this.addMetadataBtn.click();

    // Wait for the metadata item to appear
    const metadataItem = this.page.locator(`[data-testid="metadata-item-${key}"]`);
    await metadataItem.waitFor({ state: 'visible' });
  }

  /**
   * Remove a metadata entry by key
   */
  async removeMetadata(key: string) {
    const removeBtn = this.page.locator(`[data-testid="remove-metadata-${key}-btn"]`);
    await removeBtn.click();
  }

  /**
   * Submit the create dataset form
   */
  async submitCreateForm() {
    await this.submitDatasetBtn.click();
  }

  /**
   * Cancel the create dataset dialog
   */
  async cancelCreateDialog() {
    await this.cancelDatasetBtn.click();
    // Wait for the dialog title to disappear (indicates dialog is closed)
    await this.dialogTitle.waitFor({ state: 'hidden' });
  }

  /**
   * Close the dialog using the X button
   */
  async closeDialog() {
    await this.dialogCloseBtn.click();
    // Wait for the dialog title to disappear
    await this.dialogTitle.waitFor({ state: 'hidden' });
  }

  /**
   * Create a dataset with all steps combined
   */
  async createDataset(data: {
    name: string;
    description?: string;
    repositoryUrl: string;
    metadata?: Record<string, string>;
  }) {
    await this.openCreateDialog();
    await this.fillDatasetForm(data);

    // Wait for the POST request to be sent
    const createRequestPromise = this.page.waitForResponse(
      response => response.url().includes('/benchmark/datasets') && response.request().method() === 'POST',
      { timeout: 10000 }
    );

    await this.submitCreateForm();

    // Wait for the API request to complete
    await createRequestPromise;

    // Wait for dialog to close (success case)
    await this.dialogTitle.waitFor({ state: 'hidden', timeout: 5000 });

    // Wait for the list to refresh (query invalidation triggers refetch)
    await this.page.waitForLoadState('networkidle');

    // Extra wait for React Query to refetch and update the list
    await this.page.waitForTimeout(1000);
  }

  /**
   * Get metadata item element
   */
  getMetadataItem(key: string): Locator {
    return this.page.locator(`[data-testid="metadata-item-${key}"]`);
  }
}
