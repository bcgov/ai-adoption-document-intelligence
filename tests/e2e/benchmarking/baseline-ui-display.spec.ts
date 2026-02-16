import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from '../helpers/auth';
import { RunDetailPage } from '../pages/RunDetailPage';
import { ProjectDetailPage } from '../pages/ProjectDetailPage';

/**
 * Test Plan: US-034 - Baseline Management - UI Display Scenarios
 * Tests baseline badge display and UI elements across different views
 */
test.describe('Baseline UI Display', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  const SEED_PROJECT_ID = 'seed-project-invoice-extraction';
  const SEED_RUN_ID_COMPLETED = 'seed-run-completed-001'; // Baseline run
  const SEED_RUN_ID_PASSING = 'seed-run-passing-004'; // Non-baseline run
  const SEED_RUN_ID_FAILED = 'seed-run-failed-003'; // Failed run

  let runDetailPage: RunDetailPage;
  let projectDetailPage: ProjectDetailPage;

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

    runDetailPage = new RunDetailPage(page);
    projectDetailPage = new ProjectDetailPage(page);
  });

  // REQ US-034 Scenario 3: Baseline Badge in Run Detail Header
  test('should display baseline badge prominently in run detail header', async () => {
    // Given: Baseline run
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    // Then: Baseline badge is visible and prominent
    await expect(runDetailPage.baselineBadge).toBeVisible();
    await expect(runDetailPage.baselineBadge).toContainText(/BASELINE/i);

    // Badge has distinct styling (position: near run title)
    const badgeLocator = runDetailPage.baselineBadge;
    await expect(badgeLocator).toHaveAttribute('data-testid', 'baseline-badge');
  });

  // REQ US-034 Scenario 3: No Baseline Badge for Non-Baseline Runs
  test('should not display baseline badge for non-baseline runs', async () => {
    // Given: Non-baseline run
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_PASSING);

    // Then: Baseline badge is not visible
    await expect(runDetailPage.baselineBadge).not.toBeVisible();

    // "Is Baseline" shows "No" in run info table
    const isBaselineValue = runDetailPage.getIsBaselineValue();
    await expect(isBaselineValue).toContainText('No');
  });

  // REQ US-034: Action Button Visibility - Baseline Run
  test('should show edit thresholds button for baseline runs', async () => {
    // Given: Baseline run
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    // Then: Edit Thresholds button is visible
    await expect(runDetailPage.editThresholdsBtn).toBeVisible();
    await expect(runDetailPage.editThresholdsBtn).toContainText(/Edit Thresholds/i);

    // Promote to Baseline button is not visible
    await expect(runDetailPage.promoteBaselineBtn).not.toBeVisible();
  });

  // REQ US-034: Action Button Visibility - Non-Baseline Completed Run
  test('should show promote baseline button for non-baseline completed runs', async () => {
    // Given: Non-baseline completed run
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_PASSING);

    // Then: Promote to Baseline button is visible and enabled
    await expect(runDetailPage.promoteBaselineBtn).toBeVisible();
    await expect(runDetailPage.promoteBaselineBtn).toBeEnabled();
    await expect(runDetailPage.promoteBaselineBtn).toContainText(/Promote to Baseline/i);

    // Edit Thresholds button is not visible
    await expect(runDetailPage.editThresholdsBtn).not.toBeVisible();
  });

  // REQ US-034: Action Button Visibility - Failed Run
  test('should disable promote baseline button for failed runs', async () => {
    // Given: Failed run
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_FAILED);

    // Then: Promote to Baseline button is visible but disabled
    await expect(runDetailPage.promoteBaselineBtn).toBeVisible();
    await expect(runDetailPage.promoteBaselineBtn).toBeDisabled();

    // Tooltip explains why it's disabled
    await runDetailPage.promoteBaselineBtn.hover();
    const tooltip = runDetailPage.promoteBaselineTooltip;
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText(/Only completed runs can be promoted/i);
    await expect(tooltip).toContainText(/failed/i);
  });

  // REQ US-034 Scenario 3: Baseline Badge Tooltip
  test.skip('should show tooltip explaining baseline badge', async () => {
    // SKIPPED: Requires tooltip implementation on baseline badge
    // Given: Baseline run with badge
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    // When: User hovers over baseline badge
    await runDetailPage.baselineBadge.hover();

    // Then: Tooltip appears
    const tooltip = runDetailPage.page.locator('[role="tooltip"]');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('This run is the baseline for comparison');
  });

  // REQ US-034 Scenario 3: Baseline Badge in Run List
  test.skip('should display baseline badge in run list table', async ({ page }) => {
    // SKIPPED: Requires baseline badge column in run list table
    // Given: Project with baseline run
    await projectDetailPage.goto(SEED_PROJECT_ID);

    // When: Run list is displayed
    const runsTable = projectDetailPage.runsTable;
    await expect(runsTable).toBeVisible();

    // Then: Baseline run has badge in its row
    const baselineRunRow = page.locator(`[data-testid*="${SEED_RUN_ID_COMPLETED}"]`).or(
      runsTable.locator('tr').filter({ hasText: 'seed-run-completed-001' })
    );
    await expect(baselineRunRow).toBeVisible();

    const baselineBadge = baselineRunRow.locator('[class*="Badge"]').filter({ hasText: /BASELINE/i });
    await expect(baselineBadge).toBeVisible();
  });

  // REQ US-034: View Regression Report Button Visibility
  test.skip('should show regression report button for runs with regressions', async () => {
    // SKIPPED: Requires regression report feature implementation
    // Given: Run with baseline comparison and regressions
    const SEED_RUN_ID_REGRESSED = 'seed-run-regressed-005';
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    // When: Run detail is displayed
    // Then: "View Regression Report" button is visible
    await expect(runDetailPage.viewRegressionReportBtn).toBeVisible();
    await expect(runDetailPage.viewRegressionReportBtn).toContainText(/View Regression Report/i);

    // Button is clickable
    await expect(runDetailPage.viewRegressionReportBtn).toBeEnabled();
  });

  // REQ US-034 Scenario 9: Baseline Exempt from Retention Indicator
  test.skip('should indicate baseline runs are protected from retention', async () => {
    // SKIPPED: Requires retention policy UI implementation
    // Given: Baseline run
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    // Then: UI indicates baseline runs are protected
    const retentionIndicator = runDetailPage.page.locator('text=/Protected from retention|Exempt from cleanup/i');
    await expect(retentionIndicator).toBeVisible();
  });
});
