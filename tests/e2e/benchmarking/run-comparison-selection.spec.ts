import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from '../helpers/auth';
import { ProjectDetailPage } from '../pages/ProjectDetailPage';
import { RunComparisonPage } from '../pages/RunComparisonPage';

test.describe('US-036: Run Comparison - Run Selection', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  const TEST_PROJECT_ID = 'seed-project-invoice-extraction';
  const TEST_RUN_1 = 'seed-run-completed-001';
  const TEST_RUN_2 = 'seed-run-passing-004';

  let projectPage: ProjectDetailPage;
  let comparisonPage: RunComparisonPage;

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

    projectPage = new ProjectDetailPage(page);
    comparisonPage = new RunComparisonPage(page);
  });

  // Scenario 1: Select Runs for Comparison
  test('should select 2 runs and navigate to comparison view', async ({ page }) => {
    // REQ-036-01: Select runs for comparison via checkboxes

    // Given: Run list contains multiple completed runs
    await projectPage.goto(TEST_PROJECT_ID);
    await expect(projectPage.runsTable).toBeVisible();

    // When: User selects 2 runs via checkboxes
    await projectPage.selectRunsForComparison([TEST_RUN_1, TEST_RUN_2]);

    // Then: Compare button is visible and shows count
    await expect(projectPage.compareRunsBtn).toBeVisible();
    await expect(projectPage.compareRunsBtn).toContainText('2');

    // When: User clicks "Compare" button
    await projectPage.clickCompareRuns();

    // Then: Navigation to comparison page occurs
    await expect(page).toHaveURL(new RegExp(`/benchmarking/projects/${TEST_PROJECT_ID}/compare\\?runs=`));

    // Then: Comparison view loads with both runs' data displayed
    await expect(comparisonPage.comparisonTitle).toBeVisible();
    await expect(comparisonPage.runCountText).toHaveText(/Comparing 2 runs?/);
    await expect(comparisonPage.metricsComparisonTable).toBeVisible();
  });

  test('should display comparison controls after navigation', async ({ page }) => {
    // REQ-036-01: Comparison controls are visible after navigation

    // Given: Two runs are selected
    await projectPage.goto(TEST_PROJECT_ID);
    await projectPage.selectRunsForComparison([TEST_RUN_1, TEST_RUN_2]);
    await projectPage.clickCompareRuns();

    // Then: Comparison controls are visible
    await expect(comparisonPage.exportCsvBtn).toBeVisible();
    await expect(comparisonPage.exportJsonBtn).toBeVisible();
    await expect(comparisonPage.backToProjectBtn).toBeVisible();

    // Then: All comparison sections are visible
    await expect(comparisonPage.runInfoCard).toBeVisible();
    await expect(comparisonPage.metricsComparisonCard).toBeVisible();
    await expect(comparisonPage.parametersComparisonCard).toBeVisible();
    await expect(comparisonPage.tagsComparisonCard).toBeVisible();
  });

  // Scenario 16: Error Handling - Invalid Run Selection
  test('should disable compare button when only 1 run selected', async () => {
    // REQ-036-16: Compare button is disabled for invalid selection

    // Given: Run list is displayed
    await projectPage.goto(TEST_PROJECT_ID);
    await expect(projectPage.runsTable).toBeVisible();

    // When: User selects only 1 run
    await projectPage.getRunCheckbox(TEST_RUN_1).check();

    // Then: Compare button is not visible (or disabled)
    // Note: Per exploration docs, button only appears when 2+ runs selected
    await expect(projectPage.compareRunsBtn).not.toBeVisible();
  });

  test('should show compare button only when 2+ runs selected', async () => {
    // REQ-036-16: Guide user to select appropriate number of runs

    // Given: Run list is displayed
    await projectPage.goto(TEST_PROJECT_ID);

    // When: No runs are selected
    // Then: Compare button is not visible
    await expect(projectPage.compareRunsBtn).not.toBeVisible();

    // When: User selects 2 runs
    await projectPage.selectRunsForComparison([TEST_RUN_1, TEST_RUN_2]);

    // Then: Compare button becomes visible
    await expect(projectPage.compareRunsBtn).toBeVisible();
  });

  test('should allow selecting more than 2 runs for comparison', async () => {
    // REQ-036-06: Compare more than two runs

    // Given: Run list contains 3+ runs
    await projectPage.goto(TEST_PROJECT_ID);

    // When: User selects 3 runs
    const TEST_RUN_3 = 'seed-run-running-002';
    await projectPage.selectRunsForComparison([TEST_RUN_1, TEST_RUN_2, TEST_RUN_3]);

    // Then: Compare button shows count of 3
    await expect(projectPage.compareRunsBtn).toBeVisible();
    await expect(projectPage.compareRunsBtn).toContainText('3');

    // When: User clicks compare
    await projectPage.clickCompareRuns();

    // Then: Comparison page displays all 3 runs
    await expect(comparisonPage.runCountText).toHaveText(/Comparing 3 runs?/);
  });
});
