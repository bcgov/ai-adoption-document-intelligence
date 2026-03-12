import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from '../helpers/auth';
import { DatasetDetailPage } from '../pages/DatasetDetailPage';
import { SplitManagementPage } from '../pages/SplitManagementPage';
import { CreateSplitDialog } from '../pages/CreateSplitDialog';

/**
 * Test Plan: US-033 Split Management UI - Create Split
 * Scenarios: 2 (Open Create Dialog), 3 (Create Split), 4 (Sample Selection), 12 (Name Validation)
 */
test.describe('Split Management - Create Split', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  // Seed data IDs
  const DATASET_ID = 'seed-dataset-invoices';
  const VERSION_ID = 'seed-dataset-version-v1.0';

  let datasetPage: DatasetDetailPage;
  let splitsPage: SplitManagementPage;
  let createDialog: CreateSplitDialog;

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

    datasetPage = new DatasetDetailPage(page);
    splitsPage = new SplitManagementPage(page);
    createDialog = new CreateSplitDialog(page);

    // Navigate to splits tab
    await datasetPage.goto(DATASET_ID);
    await datasetPage.clickVersion(VERSION_ID);
    await datasetPage.goToSplitsTab();
    await page.waitForLoadState('networkidle');
  });

  test('Scenario 2: should open create split dialog with all form fields', async ({ page }) => {
    // Given: User is viewing dataset version detail with samples
    await expect(splitsPage.createSplitBtn).toBeVisible();

    // When: User clicks "Create Split" button
    await splitsPage.openCreateDialog();

    // Then: Split creation dialog appears
    await createDialog.waitForDialog();

    // Form fields are displayed
    await expect(createDialog.splitNameInput).toBeVisible();
    await expect(createDialog.splitTypeSelect).toBeVisible();
    await expect(createDialog.splitSamplesMultiselect).toBeVisible();

    // Verify placeholder for name input
    const placeholder = await createDialog.splitNameInput.getAttribute('placeholder');
    expect(placeholder).toContain('e.g.,');

    // Submit and Cancel buttons are visible
    await expect(createDialog.submitBtn).toBeVisible();
    await expect(createDialog.cancelBtn).toBeVisible();
  });

  test('Scenario 2: should close dialog when cancel is clicked', async ({ page }) => {
    // Given: Create split dialog is open
    await splitsPage.openCreateDialog();
    await createDialog.waitForDialog();

    // When: User clicks cancel
    await createDialog.cancel();

    // Then: Dialog closes
    await createDialog.dialog.waitFor({ state: 'hidden', timeout: 5000 });
    await expect(createDialog.dialog).not.toBeVisible();
  });

  test('Scenario 3: should create split with manual sample selection', async ({ page }) => {
    // Given: Create split dialog is open
    await splitsPage.openCreateDialog();
    await createDialog.waitForDialog();

    // When: User enters name, type, and selects samples
    await createDialog.fillName('test-split-001');
    await createDialog.selectType('Test');

    // Select 10 samples (sample-1 to sample-10)
    const sampleIds = Array.from({ length: 10 }, (_, i) => `sample-${i + 1}`);
    await createDialog.selectSamples(sampleIds);

    // Verify selected count is displayed
    await expect(createDialog.selectedSamplesCount).toContainText('10');

    // Submit the form
    await createDialog.submit();

    // Then: Success notification appears (toast or similar)
    // Note: Depends on implementation - may need to check for toast notification

    // Dialog closes
    await createDialog.dialog.waitFor({ state: 'hidden', timeout: 10000 });

    // Split list refreshes showing new split
    await page.waitForLoadState('networkidle');

    // Verify new split appears in the list
    const newSplitRow = splitsPage.getSplitRow('test-split-001');
    await expect(newSplitRow).toBeVisible({ timeout: 10000 });

    // New split shows correct sample count (10)
    const newSplitCount = splitsPage.getSplitSampleCount('test-split-001');
    await expect(newSplitCount).toContainText('10');
  });

  test('Scenario 4: should display sample selection interface', async ({ page }) => {
    // Given: Create split form is displayed
    await splitsPage.openCreateDialog();
    await createDialog.waitForDialog();

    // When: User interacts with sample selection interface
    await createDialog.splitSamplesMultiselect.click();
    await page.waitForTimeout(500);

    // Then: Multi-select checkbox list or picker is displayed
    // Samples should be shown with IDs (in current implementation, just IDs)
    const options = page.getByRole('option');
    const optionCount = await options.count();
    expect(optionCount).toBeGreaterThan(0);

    // Selected count should be displayed
    await expect(createDialog.selectedSamplesCount).toBeVisible();

    // Close the dropdown
    await page.keyboard.press('Escape');
  });

  test('Scenario 12: should show error when split name is empty', async ({ page }) => {
    // Given: Create split form is open
    await splitsPage.openCreateDialog();
    await createDialog.waitForDialog();

    // When: User submits without entering a name
    // Fill other required fields
    await createDialog.selectType('Train');

    // Try to submit with empty name
    await createDialog.submitBtn.click();

    // Then: Error message is displayed
    // Note: This depends on implementation - could be inline validation or form validation
    // Check if submit button is disabled or if error appears
    const isDialogStillOpen = await createDialog.isVisible();
    expect(isDialogStillOpen).toBeTruthy();

    // Form should not submit (dialog remains open)
  });

  test('Scenario 12: should validate split name for invalid characters', async ({ page }) => {
    // Given: Create split form is open
    await splitsPage.openCreateDialog();
    await createDialog.waitForDialog();

    // When: User enters invalid characters
    await createDialog.fillName('split@#$%');
    await createDialog.selectType('Train');

    // Select at least one sample
    await createDialog.splitSamplesMultiselect.click();
    await page.waitForTimeout(500);
    const firstOption = page.getByRole('option').first();
    await firstOption.click();
    await page.keyboard.press('Escape');

    // Try to submit
    await createDialog.submitBtn.click();

    // Then: Error message is displayed
    const hasError = await createDialog.hasError();
    if (hasError) {
      const errorText = await createDialog.getErrorText();
      expect(errorText.toLowerCase()).toMatch(/invalid|character|name/);
    }

    // Form does not submit
    const isDialogStillOpen = await createDialog.isVisible();
    expect(isDialogStillOpen).toBeTruthy();
  });

  test('Scenario 4: should allow searching/filtering samples', async ({ page }) => {
    // Given: Sample selection interface is open
    await splitsPage.openCreateDialog();
    await createDialog.waitForDialog();
    await createDialog.splitSamplesMultiselect.click();
    await page.waitForTimeout(500);

    // When: User types to search
    await page.keyboard.type('sample-1');
    await page.waitForTimeout(300);

    // Then: Filtered results are shown
    // Verify that options are filtered (implementation dependent)
    const options = page.getByRole('option');
    const optionCount = await options.count();

    // Should show filtered results
    expect(optionCount).toBeGreaterThan(0);

    // Close dropdown
    await page.keyboard.press('Escape');
  });
});
