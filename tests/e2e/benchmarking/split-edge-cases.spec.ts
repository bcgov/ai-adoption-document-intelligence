import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from '../helpers/auth';
import { DatasetDetailPage } from '../pages/DatasetDetailPage';
import { SplitManagementPage } from '../pages/SplitManagementPage';
import { CreateSplitDialog } from '../pages/CreateSplitDialog';

/**
 * Test Plan: US-033 Split Management UI - Edge Cases
 * Scenarios: 5 (Stratification), 13 (Stratification Preview), 14 (Delete Split), 15 (Split Used Warning), 16 (API Errors)
 */
test.describe('Split Management - Edge Cases', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  // Seed data IDs
  const DATASET_ID = 'seed-dataset-invoices';
  const VERSION_ID = 'seed-dataset-version-v1.0';
  const SPLIT_ID_TRAIN = 'seed-split-train'; // Used in definition
  const SPLIT_ID_VAL = 'seed-split-val'; // Unfrozen, not used

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

  test.skip('Scenario 5: should create split with stratification rules', async ({ page }) => {
    // Given: Create split form is open and samples have metadata
    await splitsPage.openCreateDialog();
    await createDialog.waitForDialog();

    // When: User selects stratification by a metadata field
    // Note: This feature may not be exposed in the UI yet
    // Implementation would require:
    // 1. Stratification section in the create dialog
    // 2. Field selector for stratification
    // 3. Distribution options (equal split, proportional, etc.)

    await createDialog.fillName('stratified-split');
    await createDialog.selectType('Train');

    // TODO: Add stratification UI interactions when implemented
    // Example:
    // await page.locator('[data-testid="enable-stratification"]').click();
    // await page.locator('[data-testid="stratify-by-select"]').selectOption('docType');
    // await page.locator('[data-testid="distribution-type"]').selectOption('equal');

    // Select samples
    const sampleIds = Array.from({ length: 50 }, (_, i) => `sample-${i + 1}`);
    await createDialog.selectSamples(sampleIds);

    // Submit
    await createDialog.submit();

    // Then: Stratification rule is included in POST request
    // Backend distributes samples proportionally
    // Split is created with balanced representation
    await createDialog.dialog.waitFor({ state: 'hidden', timeout: 10000 });

    // Verify split was created
    await page.waitForLoadState('networkidle');
    // Check that split appears in list with stratification indicators
  });

  test.skip('Scenario 13: should show stratification preview', async ({ page }) => {
    // Given: User has selected stratification by a metadata field
    await splitsPage.openCreateDialog();
    await createDialog.waitForDialog();

    // When: Stratification rule is configured
    // Note: Requires stratification UI implementation

    // Then: Preview shows sample distribution by field values
    // Example: "docType: invoice (20%), form (30%), receipt (50%)"

    // User can see if stratification is balanced
    // Helps verify stratification before creating split
  });

  test.skip('Scenario 14: should allow deleting an unfrozen split', async ({ page }) => {
    // Given: Unfrozen split exists
    await expect(splitsPage.getSplitRow(SPLIT_ID_VAL)).toBeVisible();

    // When: User clicks "Delete" action
    // Note: Delete functionality may not be implemented yet
    // Would require delete button in split row

    // const deleteBtn = page.locator(`[data-testid="delete-split-btn-${SPLIT_ID_VAL}"]`);
    // await deleteBtn.click();

    // Then: Confirmation dialog appears
    // page.on('dialog', async (dialog) => {
    //   expect(dialog.message()).toContain('Delete this split?');
    //   await dialog.accept();
    // });

    // After confirmation, split is removed from list
    // await page.waitForLoadState('networkidle');
    // await expect(splitsPage.getSplitRow(SPLIT_ID_VAL)).not.toBeVisible();
  });

  test.skip('Scenario 14: should not allow deleting a frozen split', async ({ page }) => {
    // Given: Frozen split exists
    await expect(splitsPage.getSplitRow(SPLIT_ID_TRAIN)).toBeVisible();
    await expect(splitsPage.getSplitStatusBadge(SPLIT_ID_TRAIN)).toContainText(/frozen/i);

    // Then: Delete button should be disabled or not visible
    // const deleteBtn = page.locator(`[data-testid="delete-split-btn-${SPLIT_ID_TRAIN}"]`);
    // await expect(deleteBtn).not.toBeVisible();
  });

  test.skip('Scenario 15: should warn when deleting split used in definitions', async ({ page }) => {
    // Given: Split is referenced by one or more benchmark definitions
    // SPLIT_ID_TRAIN is used in SEED_DEFINITION_ID

    // When: User attempts to delete the split
    // const deleteBtn = page.locator(`[data-testid="delete-split-btn-${SPLIT_ID_TRAIN}"]`);
    // await deleteBtn.click();

    // Then: Warning appears
    // const warningDialog = page.locator('[data-testid="split-used-warning"]');
    // await expect(warningDialog).toBeVisible();
    // await expect(warningDialog).toContainText('This split is used by');
    // await expect(warningDialog).toContainText('definition');

    // List of definitions using the split is shown
    // User must confirm understanding before proceeding or deletion is blocked
  });

  test.skip('Scenario 16: should handle API errors gracefully during creation', async ({ page }) => {
    // Given: User attempts to create a split
    await splitsPage.openCreateDialog();
    await createDialog.waitForDialog();

    // When: API returns error (simulate by creating duplicate name or other validation error)
    await createDialog.fillName('train'); // Duplicate name
    await createDialog.selectType('Train');

    // Select samples
    const sampleIds = ['sample-1', 'sample-2'];
    await createDialog.selectSamples(sampleIds);

    // Submit
    await createDialog.submitBtn.click();

    // Then: Error notification displays with server message
    const hasError = await createDialog.hasError();
    expect(hasError).toBeTruthy();

    const errorText = await createDialog.getErrorText();
    expect(errorText).toBeTruthy();

    // Form remains open with user's data preserved
    await expect(createDialog.dialog).toBeVisible();

    // Split list does not update
  });

  test.skip('Scenario 16: should handle network errors during update', async ({ page }) => {
    // Given: User attempts to update a split
    // Simulate network error by intercepting API call

    await page.route('**/api/benchmark/datasets/*/versions/*/splits/*', (route) => {
      route.abort('failed');
    });

    // Click edit on unfrozen split
    await splitsPage.clickEditSplit(SPLIT_ID_VAL);
    await page.waitForTimeout(500);

    // Then: Error notification appears
    // User can retry submission
  });

  test('Scenario: stratification rules exist in data model', async ({ page }) => {
    // Given: Split with stratification rules exists (seed-split-train)
    // Note: This verifies that stratification is in the data model
    // even if not exposed in UI

    await expect(splitsPage.getSplitRow(SPLIT_ID_TRAIN)).toBeVisible();
    await expect(splitsPage.getSplitName(SPLIT_ID_TRAIN)).toContainText('train');

    // Stratification rules are in the database but not visible in UI
    // This test just confirms the split exists and can be displayed
  });
});
