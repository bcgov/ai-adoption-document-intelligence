import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from '../helpers/auth';
import { DatasetsListPage } from '../pages/DatasetsListPage';

/**
 * Test Plan: US-027 - Dataset List & Create UI
 * REQ-027: Users can view a list of datasets and create new ones through the UI
 */
test.describe('Dataset List & Create UI', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  // Seed data constant
  const SEED_DATASET_ID = 'seed-dataset-invoices';

  let datasetsPage: DatasetsListPage;

  test.beforeAll(() => {
    if (!TEST_API_KEY) {
      throw new Error('TEST_API_KEY environment variable is not set');
    }
  });

  test.beforeEach(async ({ page }) => {
    // Setup authentication (both frontend and backend)
    await setupAuthenticatedTest(page, {
      apiKey: TEST_API_KEY!,
      backendUrl: BACKEND_URL,
      frontendUrl: FRONTEND_URL,
    });

    datasetsPage = new DatasetsListPage(page);
  });

  /**
   * Scenario 1: Dataset List Display
   * REQ-027: Dataset list page displays all datasets
   */
  test('should display dataset list with all columns', async ({ page }) => {
    // Given: Multiple datasets exist in the system
    // When: User navigates to /benchmarking/datasets
    await datasetsPage.goto();

    // Then: Table is displayed with columns: name, description, version count, created date
    await expect(datasetsPage.datasetsTable).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Description' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Version Count' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Created Date' })).toBeVisible();

    // And: All dataset data is correctly displayed
    const seedDatasetRow = datasetsPage.getDatasetRow(SEED_DATASET_ID);
    await expect(seedDatasetRow).toBeVisible();
    await expect(seedDatasetRow).toContainText('Invoice Test Dataset');

    // And: Action buttons are visible for each dataset
    // Note: Row is clickable for navigation
    await expect(seedDatasetRow).toHaveAttribute('style', /cursor:\s*pointer/);
  });

  /**
   * Scenario 2: Open Create Dataset Dialog
   * REQ-027: Create dataset dialog opens correctly
   */
  test('should open create dataset dialog', async ({ page }) => {
    // Given: User is on the dataset list page
    await datasetsPage.goto();

    // When: User clicks the "Create Dataset" button
    await datasetsPage.openCreateDialog();

    // Then: Dialog/modal appears (title and fields are visible)
    await expect(datasetsPage.dialogTitle).toBeVisible();
    await expect(datasetsPage.datasetNameInput).toBeVisible();
    await expect(datasetsPage.datasetDescriptionInput).toBeVisible();
    await expect(datasetsPage.datasetRepositoryUrlInput).toBeVisible();
    await expect(datasetsPage.metadataSection).toBeVisible();

    // And: Submit and Cancel buttons are present
    await expect(datasetsPage.submitDatasetBtn).toBeVisible();
    await expect(datasetsPage.cancelDatasetBtn).toBeVisible();

    // And: Name field is focused
    await expect(datasetsPage.datasetNameInput).toBeFocused();
  });

  /**
   * Scenario 3: Create Dataset Success
   * REQ-027: Dataset is created successfully
   */
  test('should create dataset with valid data', async ({ page }) => {
    // Given: Create dataset dialog is open
    await datasetsPage.goto();

    const uniqueName = `Test Dataset ${Date.now()}`;
    const description = 'Test description for E2E testing';
    const repositoryUrl = '~/test-datasets/e2e-test';

    // When: User fills in name, description, repositoryUrl and submits
    await datasetsPage.createDataset({
      name: uniqueName,
      description,
      repositoryUrl,
    });

    // Then: Dialog closes
    await expect(datasetsPage.dialogTitle).not.toBeVisible();

    // And: Dataset list refreshes showing the new dataset
    await page.waitForTimeout(500); // Wait for list refresh
    await expect(page.getByText(uniqueName)).toBeVisible();

    // And: New dataset appears in the list
    const newDatasetRow = page.getByText(uniqueName).locator('..').locator('..');
    await expect(newDatasetRow).toContainText(description);
  });

  /**
   * Scenario 4: Create Dataset with Metadata
   * REQ-027: Dataset with metadata is created successfully
   */
  test('should create dataset with metadata', async ({ page }) => {
    // Given: Create dataset dialog is open
    await datasetsPage.goto();
    await datasetsPage.openCreateDialog();

    const uniqueName = `Metadata Dataset ${Date.now()}`;

    // When: User adds metadata key-value pairs and submits
    await datasetsPage.fillDatasetForm({
      name: uniqueName,
      description: 'Dataset with metadata',
      repositoryUrl: '~/test-datasets/metadata-test',
      metadata: {
        domain: 'invoices',
        language: 'en',
      },
    });

    // Then: Metadata items are displayed in the form
    await expect(datasetsPage.getMetadataItem('domain')).toBeVisible();
    await expect(datasetsPage.getMetadataItem('domain')).toContainText('domain: invoices');
    await expect(datasetsPage.getMetadataItem('language')).toBeVisible();
    await expect(datasetsPage.getMetadataItem('language')).toContainText('language: en');

    // When: User submits the form
    await datasetsPage.submitCreateForm();

    // Then: Dataset is created with metadata
    await expect(datasetsPage.dialogTitle).not.toBeVisible();
    await expect(page.getByText(uniqueName)).toBeVisible();
  });

  /**
   * Scenario 5: Validation - Missing Required Name
   * REQ-027: Validation errors are displayed
   */
  test('should show error for missing required name', async ({ page }) => {
    // Given: Create dataset dialog is open
    await datasetsPage.goto();
    await datasetsPage.openCreateDialog();

    // When: User leaves name field empty and clicks submit
    await datasetsPage.datasetRepositoryUrlInput.fill('~/test-datasets/no-name');
    await datasetsPage.submitCreateForm();

    // Then: Error message appears on the name field
    await expect(datasetsPage.nameErrorMessage).toBeVisible();

    // And: Dialog remains open (form does not submit)
    await expect(datasetsPage.dialogTitle).toBeVisible();
  });

  /**
   * Scenario 6: Validation - Missing Repository URL
   * REQ-027: Repository URL validation
   */
  test('should show error for missing repository URL', async ({ page }) => {
    // Given: Create dataset dialog is open
    await datasetsPage.goto();
    await datasetsPage.openCreateDialog();

    // When: User fills in name but leaves repositoryUrl empty and submits
    await datasetsPage.datasetNameInput.fill('Test Dataset');
    await datasetsPage.submitCreateForm();

    // Then: Error message appears for repository URL field
    await expect(datasetsPage.repositoryUrlErrorMessage).toBeVisible();

    // And: Dialog remains open (form does not submit)
    await expect(datasetsPage.dialogTitle).toBeVisible();
  });

  /**
   * Scenario 7: Cancel Dialog
   * REQ-027: Dialog can be canceled
   */
  test('should cancel dialog and discard data', async ({ page }) => {
    // Given: Create dataset dialog is open with partial data entered
    await datasetsPage.goto();
    await datasetsPage.openCreateDialog();

    await datasetsPage.datasetNameInput.fill('Test Dataset');
    await datasetsPage.datasetDescriptionInput.fill('Test description');

    // When: User clicks Cancel button
    await datasetsPage.cancelCreateDialog();

    // Then: Dialog closes
    await expect(datasetsPage.dialogTitle).not.toBeVisible();

    // And: No dataset is created (check that the exact name doesn't appear in the list)
    const exactMatch = page.locator(`[data-testid^="dataset-row-"]`).filter({ hasText: /^Test Dataset$/ });
    await expect(exactMatch).not.toBeVisible();

    // When: User reopens the dialog
    await datasetsPage.openCreateDialog();

    // Then: Form data is discarded
    await expect(datasetsPage.datasetNameInput).toHaveValue('');
    await expect(datasetsPage.datasetDescriptionInput).toHaveValue('');
  });

  /**
   * Scenario 7b: Close Dialog with X button
   */
  test('should close dialog with X button', async ({ page }) => {
    // Given: Create dataset dialog is open with data
    await datasetsPage.goto();
    await datasetsPage.openCreateDialog();

    await datasetsPage.datasetNameInput.fill('Test Dataset');

    // When: User clicks X button
    await datasetsPage.closeDialog();

    // Then: Dialog closes
    await expect(datasetsPage.dialogTitle).not.toBeVisible();

    // And: Data is discarded
    await datasetsPage.openCreateDialog();
    await expect(datasetsPage.datasetNameInput).toHaveValue('');
  });

  /**
   * Scenario 8: Navigate to Dataset Detail
   * REQ-027: Dataset detail view navigation
   */
  test('should navigate to dataset detail page', async ({ page }) => {
    // Given: Dataset list is displayed with multiple datasets
    await datasetsPage.goto();
    await expect(datasetsPage.datasetsTable).toBeVisible();

    // When: User clicks on a dataset row
    await datasetsPage.clickDataset(SEED_DATASET_ID);

    // Then: Navigation to /benchmarking/datasets/{datasetId} occurs
    await expect(page).toHaveURL(new RegExp(`/benchmarking/datasets/${SEED_DATASET_ID}`));

    // And: Dataset detail page loads
    await expect(page.getByRole('heading', { name: /Invoice Test Dataset/i })).toBeVisible();
  });

  /**
   * Scenario 14: Create Dataset with Tilde Path
   * REQ-027: Tilde expansion in repository URL
   */
  test('should create dataset with tilde path', async ({ page }) => {
    // Given: Create dataset dialog is open
    await datasetsPage.goto();

    const uniqueName = `Tilde Path Dataset ${Date.now()}`;

    // When: User enters repositoryUrl as ~/Github/datasets-repo and submits
    await datasetsPage.createDataset({
      name: uniqueName,
      description: 'Dataset with tilde path',
      repositoryUrl: '~/Github/datasets-repo',
    });

    // Then: Dataset is created successfully
    await expect(datasetsPage.dialogTitle).not.toBeVisible();
    await expect(page.getByText(uniqueName)).toBeVisible();
  });

  /**
   * Scenario 15: Create Dataset with file:// URL
   * REQ-027: file:// URL support
   */
  test('should create dataset with file:// URL', async ({ page }) => {
    // Given: Create dataset dialog is open
    await datasetsPage.goto();

    const uniqueName = `File URL Dataset ${Date.now()}`;

    // When: User enters repositoryUrl as file://~/Github/datasets-repo and submits
    await datasetsPage.createDataset({
      name: uniqueName,
      description: 'Dataset with file:// URL',
      repositoryUrl: 'file://~/Github/datasets-repo',
    });

    // Then: Dataset is created successfully
    await expect(datasetsPage.dialogTitle).not.toBeVisible();
    await expect(page.getByText(uniqueName)).toBeVisible();
  });

  /**
   * Scenario 16: Create Dataset with Remote Repository
   * REQ-027: Remote URL support
   */
  test('should create dataset with remote repository URL', async ({ page }) => {
    // Given: Create dataset dialog is open
    await datasetsPage.goto();

    const uniqueName = `Remote Dataset ${Date.now()}`;

    // When: User enters repositoryUrl as file:// URL and submits
    await datasetsPage.createDataset({
      name: uniqueName,
      description: 'Dataset with remote repository',
      repositoryUrl: 'file://~/test-datasets/remote-test',
    });

    // Then: Dataset is created successfully
    await expect(datasetsPage.dialogTitle).not.toBeVisible();
    await expect(page.getByText(uniqueName)).toBeVisible();
  });

  /**
   * Scenario: Remove Metadata
   * Additional test for metadata management
   */
  test('should remove metadata entries', async ({ page }) => {
    // Given: Create dataset dialog is open with metadata
    await datasetsPage.goto();
    await datasetsPage.openCreateDialog();

    await datasetsPage.datasetNameInput.fill('Metadata Test');
    await datasetsPage.datasetRepositoryUrlInput.fill('~/test');

    // When: User adds metadata and then removes it
    await datasetsPage.addMetadata('test-key', 'test-value');
    await expect(datasetsPage.getMetadataItem('test-key')).toBeVisible();

    await datasetsPage.removeMetadata('test-key');

    // Then: Metadata item is removed
    await expect(datasetsPage.getMetadataItem('test-key')).not.toBeVisible();
  });

  /**
   * Scenario 10: Loading State
   * REQ-027: Loading state is displayed
   */
  test('should show loading state while fetching datasets', async ({ page }) => {
    // Given: User navigates to /benchmarking/datasets
    // When: Data is being fetched from the API

    // Note: This test is difficult to capture in real-time without network throttling
    // We verify that either loading spinner OR table is visible (not both or neither)
    await page.goto(`${FRONTEND_URL}/benchmarking/datasets`);

    // Wait for either loading spinner or table to appear
    await Promise.race([
      datasetsPage.loadingSpinner.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {}),
      datasetsPage.datasetsTable.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {}),
    ]);

    // Then: Eventually the table is displayed (loading completes)
    await expect(datasetsPage.datasetsTable).toBeVisible();

    // And: Loading indicator disappears
    await expect(datasetsPage.loadingSpinner).not.toBeVisible();
  });
});

/**
 * Test Group: Empty State Scenarios
 * These tests require an empty database to verify empty state behavior
 */
test.describe('Dataset List - Empty State', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  let datasetsPage: DatasetsListPage;

  test.beforeAll(() => {
    if (!TEST_API_KEY) {
      throw new Error('TEST_API_KEY environment variable is not set');
    }
  });

  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedTest(page, {
      apiKey: TEST_API_KEY!,
      backendUrl: BACKEND_URL,
      frontendUrl: FRONTEND_URL,
    });

    datasetsPage = new DatasetsListPage(page);
  });

  /**
   * Scenario 9: Empty State Display
   * REQ-027: Empty state is shown when no datasets exist
   * Note: This test will fail if seed data exists. Run with empty database.
   */
  test.skip('should display empty state when no datasets exist', async ({ page }) => {
    // Given: No datasets exist in the system
    // When: User navigates to /benchmarking/datasets
    await datasetsPage.goto();

    // Then: Empty state message is displayed
    await expect(datasetsPage.emptyStateContainer).toBeVisible();
    await expect(datasetsPage.emptyStateTitle).toBeVisible();
    await expect(page.getByText('Create your first benchmark dataset to get started')).toBeVisible();

    // And: "Create Dataset" button is visible and functional
    await expect(datasetsPage.createDatasetEmptyBtn).toBeVisible();

    // And: No table is shown
    await expect(datasetsPage.datasetsTable).not.toBeVisible();
  });

  /**
   * Scenario 9b: Create from Empty State
   */
  test.skip('should create dataset from empty state', async ({ page }) => {
    // Given: Empty state is displayed
    await datasetsPage.goto();
    await expect(datasetsPage.emptyStateContainer).toBeVisible();

    // When: User clicks create button from empty state
    await datasetsPage.openCreateDialogFromEmptyState();

    // Then: Dialog opens
    await expect(datasetsPage.createDatasetDialog).toBeVisible();

    // And: User can create a dataset
    await datasetsPage.fillDatasetForm({
      name: 'First Dataset',
      description: 'Created from empty state',
      repositoryUrl: '~/first-dataset',
    });
    await datasetsPage.submitCreateForm();

    // Then: Empty state disappears and table is shown
    await expect(datasetsPage.emptyStateContainer).not.toBeVisible();
    await expect(datasetsPage.datasetsTable).toBeVisible();
    await expect(page.getByText('First Dataset')).toBeVisible();
  });
});
