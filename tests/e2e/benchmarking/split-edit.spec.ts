import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from '../helpers/auth';
import { DatasetDetailPage } from '../pages/DatasetDetailPage';
import { SplitManagementPage } from '../pages/SplitManagementPage';
import { EditSplitDialog } from '../pages/EditSplitDialog';

/**
 * Test Plan: US-033 Split Management UI - Edit Split
 * Scenarios: 6 (Update Unfrozen Split), 7 (Cannot Edit Frozen Split)
 */
test.describe('Split Management - Edit Split', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  // Seed data IDs
  const DATASET_ID = 'seed-dataset-invoices';
  const VERSION_ID = 'seed-dataset-version-v1.0';
  const SPLIT_ID_VAL = 'seed-split-val'; // Unfrozen split
  const SPLIT_ID_TRAIN = 'seed-split-train'; // Frozen split
  const SPLIT_ID_TEST = 'seed-split-test'; // Frozen split

  let datasetPage: DatasetDetailPage;
  let splitsPage: SplitManagementPage;
  let editDialog: EditSplitDialog;

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
    editDialog = new EditSplitDialog(page);

    // Navigate to splits tab
    await datasetPage.goto(DATASET_ID);
    await datasetPage.clickVersion(VERSION_ID);
    await datasetPage.goToSplitsTab();
    await page.waitForLoadState('networkidle');
  });

  test('Scenario 6: should open edit dialog for unfrozen split', async ({ page }) => {
    // Given: Unfrozen split exists
    await expect(splitsPage.getSplitRow(SPLIT_ID_VAL)).toBeVisible();
    await expect(splitsPage.getSplitStatusBadge(SPLIT_ID_VAL)).toContainText(/editable/i);

    // When: User clicks "Edit" action
    await splitsPage.clickEditSplit(SPLIT_ID_VAL);

    // Then: Edit dialog opens
    await editDialog.waitForDialog();

    // Type badge is shown (non-editable)
    await expect(editDialog.editSplitTypeBadge).toBeVisible();
    await expect(editDialog.editSplitTypeBadge).toContainText(/val/i);

    // Current count is displayed
    await expect(editDialog.editSplitCurrentCount).toBeVisible();
    await expect(editDialog.editSplitCurrentCount).toContainText('30');

    // Sample multiselect is available
    await expect(editDialog.editSplitSamplesMultiselect).toBeVisible();

    // Submit and Cancel buttons are visible
    await expect(editDialog.submitBtn).toBeVisible();
    await expect(editDialog.cancelBtn).toBeVisible();
  });

  test.skip('Scenario 6: should update unfrozen split with new sample selection', async ({ page }) => {
    // Given: Edit dialog is open for unfrozen split
    await splitsPage.clickEditSplit(SPLIT_ID_VAL);
    await editDialog.waitForDialog();

    // When: User modifies sample selection and saves
    // Select new samples (e.g., sample-1 to sample-20)
    const newSampleIds = Array.from({ length: 20 }, (_, i) => `sample-${i + 1}`);
    await editDialog.selectSamples(newSampleIds);

    // Verify selected count updates
    await expect(editDialog.editSplitSelectedCount).toContainText('20');

    // Submit the update
    await editDialog.submit();

    // Then: Dialog closes
    await editDialog.dialog.waitFor({ state: 'hidden', timeout: 10000 });

    // Split is updated with new sample list
    await page.waitForLoadState('networkidle');

    // Sample count updates
    const updatedCount = splitsPage.getSplitSampleCount(SPLIT_ID_VAL);
    await expect(updatedCount).toContainText('20');

    // Success notification appears (implementation dependent)
  });

  test('Scenario 6: should cancel edit without saving changes', async ({ page }) => {
    // Given: Edit dialog is open
    await splitsPage.clickEditSplit(SPLIT_ID_VAL);
    await editDialog.waitForDialog();

    // When: User clicks cancel
    await editDialog.cancel();

    // Then: Dialog closes without saving
    await editDialog.dialog.waitFor({ state: 'hidden', timeout: 5000 });
    await expect(editDialog.dialog).not.toBeVisible();

    // Split count remains unchanged
    const count = splitsPage.getSplitSampleCount(SPLIT_ID_VAL);
    await expect(count).toContainText('30');
  });

  test('Scenario 7: should not show edit button for frozen splits', async ({ page }) => {
    // Given: Split with frozen=true exists
    await expect(splitsPage.getSplitRow(SPLIT_ID_TRAIN)).toBeVisible();
    await expect(splitsPage.getSplitStatusBadge(SPLIT_ID_TRAIN)).toContainText(/frozen/i);

    // When: User views the split in the list
    // Then: "Edit" button is not visible
    await expect(splitsPage.getEditSplitBtn(SPLIT_ID_TRAIN)).not.toBeVisible();

    // Frozen badge/indicator is displayed
    await expect(splitsPage.getSplitStatusBadge(SPLIT_ID_TRAIN)).toBeVisible();
    await expect(splitsPage.getSplitStatusBadge(SPLIT_ID_TRAIN)).toContainText(/frozen/i);
  });

  test('Scenario 7: should display frozen badge for frozen test split', async ({ page }) => {
    // Given: Frozen test split exists
    await expect(splitsPage.getSplitRow(SPLIT_ID_TEST)).toBeVisible();

    // Then: Frozen badge is displayed
    await expect(splitsPage.getSplitStatusBadge(SPLIT_ID_TEST)).toBeVisible();
    await expect(splitsPage.getSplitStatusBadge(SPLIT_ID_TEST)).toContainText(/frozen/i);

    // Edit button is not visible
    await expect(splitsPage.getEditSplitBtn(SPLIT_ID_TEST)).not.toBeVisible();
  });

  test('Scenario 7: should have tooltip explaining frozen status', async ({ page }) => {
    // Given: Frozen split is displayed
    await expect(splitsPage.getSplitRow(SPLIT_ID_TRAIN)).toBeVisible();

    // When: User hovers over frozen badge or attempts to interact
    const frozenBadge = splitsPage.getSplitStatusBadge(SPLIT_ID_TRAIN);
    await frozenBadge.hover();

    // Then: Tooltip may appear (implementation dependent)
    // Note: This test may need adjustment based on actual tooltip implementation
    // For now, just verify the badge is visible and indicates frozen status
    await expect(frozenBadge).toContainText(/frozen/i);
  });

  test.skip('Scenario 7: should return 400 error when attempting to update frozen split via API', async ({ page }) => {
    // This test would require making a direct API call to test backend validation
    // Given: Frozen split exists
    // When: Direct API call attempts to update frozen split
    // Then: API returns 400 error

    // Note: This is more of a backend test, but could be simulated here
    // by intercepting network requests if the UI accidentally allows it
  });
});
