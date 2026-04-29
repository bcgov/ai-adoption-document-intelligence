import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from '../helpers/auth';
import { DatasetDetailPage } from '../pages/DatasetDetailPage';
import { SplitManagementPage } from '../pages/SplitManagementPage';

/**
 * Test Plan: US-033 Split Management UI - Freeze Split
 * Scenarios: 8 (Freeze Golden Regression Split), 9 (Freeze Confirmation Dialog)
 */
test.describe('Split Management - Freeze Split', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  // Seed data IDs
  const DATASET_ID = 'seed-dataset-invoices';
  const VERSION_ID = 'seed-dataset-version-v1.0';
  const SPLIT_ID_GOLDEN = 'seed-split-golden-unfrozen'; // Unfrozen golden split

  let datasetPage: DatasetDetailPage;
  let splitsPage: SplitManagementPage;

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

    // Navigate to splits tab
    await datasetPage.goto(DATASET_ID);
    await datasetPage.clickVersion(VERSION_ID);
    await datasetPage.goToSplitsTab();
    await page.waitForLoadState('networkidle');
  });

  test('Scenario 8: should show freeze button for unfrozen golden split', async ({ page }) => {
    // Given: Unfrozen split of type "golden" exists
    await expect(splitsPage.getSplitRow(SPLIT_ID_GOLDEN)).toBeVisible();
    await expect(splitsPage.getSplitTypeBadge(SPLIT_ID_GOLDEN)).toContainText(/golden/i);
    await expect(splitsPage.getSplitStatusBadge(SPLIT_ID_GOLDEN)).toContainText(/editable/i);

    // Then: "Freeze" button is visible
    await expect(splitsPage.getFreezeSplitBtn(SPLIT_ID_GOLDEN)).toBeVisible();
  });

  test('Scenario 9: should show confirmation dialog when freezing split', async ({ page }) => {
    // Given: User initiates freeze action on a split
    await expect(splitsPage.getFreezeSplitBtn(SPLIT_ID_GOLDEN)).toBeVisible();

    // Set up dialog listener before clicking
    page.on('dialog', async (dialog) => {
      // When: Confirmation dialog appears
      // Then: Dialog clearly states warning
      expect(dialog.message()).toMatch(/freeze/i);
      expect(dialog.message()).toMatch(/immutable/i);
      expect(dialog.message()).toMatch(/cannot be undone/i);

      // User must explicitly confirm (for this test, we'll dismiss)
      await dialog.dismiss();
    });

    // Click freeze button
    await splitsPage.clickFreezeSplit(SPLIT_ID_GOLDEN);

    // Wait a moment for dialog to potentially appear
    await page.waitForTimeout(1000);
  });

  test('Scenario 8: should freeze golden regression split after confirmation', async ({ page }) => {
    // Given: Unfrozen golden split exists
    await expect(splitsPage.getSplitStatusBadge(SPLIT_ID_GOLDEN)).toContainText(/editable/i);

    // When: User clicks "Freeze" action and confirms
    page.on('dialog', async (dialog) => {
      // Confirm the freeze action
      await dialog.accept();
    });

    await splitsPage.clickFreezeSplit(SPLIT_ID_GOLDEN);

    // Wait for API call and UI update
    await page.waitForLoadState('networkidle');

    // Then: Split's frozen flag is set to true
    // Frozen badge appears
    await expect(splitsPage.getSplitStatusBadge(SPLIT_ID_GOLDEN)).toContainText(/frozen/i);

    // Split can no longer be edited
    await expect(splitsPage.getEditSplitBtn(SPLIT_ID_GOLDEN)).not.toBeVisible();

    // Freeze button is no longer visible
    await expect(splitsPage.getFreezeSplitBtn(SPLIT_ID_GOLDEN)).not.toBeVisible();

    // Success notification appears (implementation dependent)
  });

  test('Scenario 9: should not freeze split if user cancels confirmation', async ({ page }) => {
    // Given: User initiates freeze action
    const originalStatus = await splitsPage.getSplitStatusBadge(SPLIT_ID_GOLDEN).textContent();

    // When: User cancels the confirmation dialog
    page.on('dialog', async (dialog) => {
      await dialog.dismiss();
    });

    await splitsPage.clickFreezeSplit(SPLIT_ID_GOLDEN);

    // Wait a moment
    await page.waitForTimeout(1000);

    // Then: Split remains unfrozen (status unchanged after cancel)
    const statusAfterCancel = await splitsPage.getSplitStatusBadge(SPLIT_ID_GOLDEN).textContent();
    expect(statusAfterCancel).toBe(originalStatus);
    await expect(splitsPage.getSplitStatusBadge(SPLIT_ID_GOLDEN)).toContainText(/editable/i);

    // Edit button is still visible
    await expect(splitsPage.getEditSplitBtn(SPLIT_ID_GOLDEN)).toBeVisible();

    // Freeze button is still visible
    await expect(splitsPage.getFreezeSplitBtn(SPLIT_ID_GOLDEN)).toBeVisible();
  });

  test('Scenario 9: freeze button only appears for golden type splits', async ({ page }) => {
    // Given: Multiple splits of different types exist
    // Then: Only unfrozen golden splits should have freeze button

    // Golden split (unfrozen) - should have freeze button
    await expect(splitsPage.getFreezeSplitBtn(SPLIT_ID_GOLDEN)).toBeVisible();

    // Validation split (unfrozen) - should NOT have freeze button
    const valSplitId = 'seed-split-val';
    await expect(splitsPage.getSplitRow(valSplitId)).toBeVisible();
    await expect(splitsPage.getFreezeSplitBtn(valSplitId)).not.toBeVisible();

    // Train split (frozen) - should NOT have freeze button
    const trainSplitId = 'seed-split-train';
    await expect(splitsPage.getSplitRow(trainSplitId)).toBeVisible();
    await expect(splitsPage.getFreezeSplitBtn(trainSplitId)).not.toBeVisible();
  });
});
