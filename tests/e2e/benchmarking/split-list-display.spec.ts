import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from '../helpers/auth';
import { DatasetDetailPage } from '../pages/DatasetDetailPage';
import { SplitManagementPage } from '../pages/SplitManagementPage';

/**
 * Test Plan: US-033 Split Management UI - Split List Display
 * Scenarios: 1 (View Splits List), 10 (Split Type Badge Display), 11 (Empty Splits List)
 */
test.describe('Split Management - List Display', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  // Seed data IDs
  const DATASET_ID = 'seed-dataset-invoices';
  const VERSION_ID = 'seed-dataset-version-v1.0';
  const SPLIT_ID_TRAIN = 'seed-split-train';
  const SPLIT_ID_VAL = 'seed-split-val';
  const SPLIT_ID_TEST = 'seed-split-test';
  const SPLIT_ID_GOLDEN = 'seed-split-golden-unfrozen';
  const DATASET_ID_NO_SPLITS = 'seed-dataset-version-v2.0-draft'; // Draft version with no splits

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
  });

  test('Scenario 1: should display splits list with all columns', async ({ page }) => {
    // Given: Dataset version has multiple splits defined
    await datasetPage.goto(DATASET_ID);

    // When: User selects version and views splits tab
    await datasetPage.clickVersion(VERSION_ID);
    await datasetPage.goToSplitsTab();
    await page.waitForLoadState('networkidle');

    // Then: Splits section displays table with columns
    await expect(splitsPage.splitsTitle).toBeVisible();
    await expect(splitsPage.splitsTitle).toContainText('Dataset Splits');

    // Verify "Create Split" button is visible
    await expect(splitsPage.createSplitBtn).toBeVisible();

    // Verify splits table is displayed
    await expect(splitsPage.splitsTable).toBeVisible();

    // Verify all splits are listed
    const splitCount = await splitsPage.getSplitCount();
    expect(splitCount).toBeGreaterThanOrEqual(4); // At least 4 splits from seed data

    // Verify specific splits exist
    await expect(splitsPage.getSplitRow(SPLIT_ID_TRAIN)).toBeVisible();
    await expect(splitsPage.getSplitRow(SPLIT_ID_VAL)).toBeVisible();
    await expect(splitsPage.getSplitRow(SPLIT_ID_TEST)).toBeVisible();
    await expect(splitsPage.getSplitRow(SPLIT_ID_GOLDEN)).toBeVisible();

    // Verify columns are displayed for train split
    await expect(splitsPage.getSplitName(SPLIT_ID_TRAIN)).toContainText('train');
    await expect(splitsPage.getSplitTypeBadge(SPLIT_ID_TRAIN)).toBeVisible();
    await expect(splitsPage.getSplitSampleCount(SPLIT_ID_TRAIN)).toContainText('100');
    await expect(splitsPage.getSplitStatusBadge(SPLIT_ID_TRAIN)).toBeVisible();
    await expect(splitsPage.getSplitCreatedDate(SPLIT_ID_TRAIN)).toBeVisible();
  });

  test('Scenario 10: should display split type badges with correct colors', async ({ page }) => {
    // Given: Splits of different types exist
    await datasetPage.goto(DATASET_ID);
    await datasetPage.clickVersion(VERSION_ID);
    await datasetPage.goToSplitsTab();
    await page.waitForLoadState('networkidle');

    // When: Split list is rendered
    // Then: Each type has distinct badge color

    // Train split - blue badge
    const trainBadge = splitsPage.getSplitTypeBadge(SPLIT_ID_TRAIN);
    await expect(trainBadge).toBeVisible();
    await expect(trainBadge).toContainText(/train/i);

    // Validation split - cyan badge
    const valBadge = splitsPage.getSplitTypeBadge(SPLIT_ID_VAL);
    await expect(valBadge).toBeVisible();
    await expect(valBadge).toContainText(/val/i);

    // Test split - grape/purple badge
    const testBadge = splitsPage.getSplitTypeBadge(SPLIT_ID_TEST);
    await expect(testBadge).toBeVisible();
    await expect(testBadge).toContainText(/test/i);

    // Golden split - yellow badge
    const goldenBadge = splitsPage.getSplitTypeBadge(SPLIT_ID_GOLDEN);
    await expect(goldenBadge).toBeVisible();
    await expect(goldenBadge).toContainText(/golden/i);
  });

  test('Scenario 10: should display frozen and editable status badges', async ({ page }) => {
    // Given: Splits with different frozen statuses exist
    await datasetPage.goto(DATASET_ID);
    await datasetPage.clickVersion(VERSION_ID);
    await datasetPage.goToSplitsTab();
    await page.waitForLoadState('networkidle');

    // When: Split list is rendered
    // Then: Status badges are displayed

    // Train split is frozen
    const trainStatusBadge = splitsPage.getSplitStatusBadge(SPLIT_ID_TRAIN);
    await expect(trainStatusBadge).toBeVisible();
    await expect(trainStatusBadge).toContainText(/frozen/i);

    // Validation split is editable
    const valStatusBadge = splitsPage.getSplitStatusBadge(SPLIT_ID_VAL);
    await expect(valStatusBadge).toBeVisible();
    await expect(valStatusBadge).toContainText(/editable/i);

    // Test split is frozen
    const testStatusBadge = splitsPage.getSplitStatusBadge(SPLIT_ID_TEST);
    await expect(testStatusBadge).toBeVisible();
    await expect(testStatusBadge).toContainText(/frozen/i);

    // Golden split is editable (unfrozen)
    const goldenStatusBadge = splitsPage.getSplitStatusBadge(SPLIT_ID_GOLDEN);
    await expect(goldenStatusBadge).toBeVisible();
    await expect(goldenStatusBadge).toContainText(/editable/i);
  });

  test('Scenario 1: should show correct sample counts for each split', async ({ page }) => {
    // Given: Dataset version has splits with different sample counts
    await datasetPage.goto(DATASET_ID);
    await datasetPage.clickVersion(VERSION_ID);
    await datasetPage.goToSplitsTab();
    await page.waitForLoadState('networkidle');

    // Then: Sample counts are displayed correctly
    await expect(splitsPage.getSplitSampleCount(SPLIT_ID_TRAIN)).toContainText('100');
    await expect(splitsPage.getSplitSampleCount(SPLIT_ID_VAL)).toContainText('30');
    await expect(splitsPage.getSplitSampleCount(SPLIT_ID_TEST)).toContainText('50');
    await expect(splitsPage.getSplitSampleCount(SPLIT_ID_GOLDEN)).toContainText('20');
  });

  test('Scenario 1: should show action buttons based on split status', async ({ page }) => {
    // Given: Dataset version has frozen and unfrozen splits
    await datasetPage.goto(DATASET_ID);
    await datasetPage.clickVersion(VERSION_ID);
    await datasetPage.goToSplitsTab();
    await page.waitForLoadState('networkidle');

    // Then: Frozen splits should not have edit button
    await expect(splitsPage.getEditSplitBtn(SPLIT_ID_TRAIN)).not.toBeVisible();
    await expect(splitsPage.getEditSplitBtn(SPLIT_ID_TEST)).not.toBeVisible();

    // Unfrozen splits should have edit button
    await expect(splitsPage.getEditSplitBtn(SPLIT_ID_VAL)).toBeVisible();
    await expect(splitsPage.getEditSplitBtn(SPLIT_ID_GOLDEN)).toBeVisible();

    // Only unfrozen golden splits should have freeze button
    await expect(splitsPage.getFreezeSplitBtn(SPLIT_ID_GOLDEN)).toBeVisible();

    // Other splits should not have freeze button
    await expect(splitsPage.getFreezeSplitBtn(SPLIT_ID_TRAIN)).not.toBeVisible();
    await expect(splitsPage.getFreezeSplitBtn(SPLIT_ID_VAL)).not.toBeVisible();
    await expect(splitsPage.getFreezeSplitBtn(SPLIT_ID_TEST)).not.toBeVisible();
  });

  test.skip('Scenario 11: should show empty state when no splits exist', async ({ page }) => {
    // Given: Dataset version has no splits defined
    await datasetPage.goto(DATASET_ID);
    await datasetPage.clickVersion(DATASET_ID_NO_SPLITS);
    await datasetPage.goToSplitsTab();
    await page.waitForLoadState('networkidle');

    // When: User views the splits section
    // Then: Empty state message is displayed
    await expect(splitsPage.splitsEmptyState).toBeVisible();
    await expect(splitsPage.noSplitsMessage).toContainText(/No splits defined/i);

    // "Create Split" or "Create First Split" button is prominently displayed
    const createBtnVisible = await splitsPage.createFirstSplitBtn.isVisible();
    expect(createBtnVisible).toBeTruthy();

    // No table is shown
    const tableVisible = await splitsPage.splitsTable.isVisible();
    expect(tableVisible).toBeFalsy();
  });
});
