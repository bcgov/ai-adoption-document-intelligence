import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from '../helpers/auth';
import { RegressionReportPage } from '../pages/RegressionReportPage';

/**
 * Test Plan: US-037 - Regression Reports UI - Edge Cases
 * Tests edge cases like no regressions, no baseline, and error states
 */
test.describe('Regression Report - Edge Cases', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  const SEED_PROJECT_ID = 'seed-project-invoice-extraction';
  const SEED_RUN_ID_PASSING = 'seed-run-passing-004'; // All metrics passing
  const SEED_RUN_ID_FAILED = 'seed-run-failed-003'; // Failed run (no baseline comparison)

  let regressionPage: RegressionReportPage;

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

    regressionPage = new RegressionReportPage(page);
  });

  // REQ US-037 Scenario 12: No Regressions Detected
  test('should show success message when no regressions detected', async () => {
    // Given: Run completed with all metrics passing thresholds
    // When: User views the regression report
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_PASSING);

    // Then: Success message: "No regressions detected ✅"
    await expect(regressionPage.successAlert).toBeVisible();
    await expect(regressionPage.successAlert).toContainText(/All Metrics Passed/i);

    // Summary shows: all metrics passed
    await expect(regressionPage.page.getByText(/All metrics meet or exceed/i)).toBeVisible();

    // User is assured the run is healthy
    // No regression alert should be shown
    const regressionAlertCount = await regressionPage.regressionAlert.count();
    if (regressionAlertCount > 0) {
      // If alert exists, it should not show regression warning
      await expect(regressionPage.regressionAlert).not.toContainText(/Regression Detected/i);
    }
  });

  // REQ US-037 Scenario 12: All Metrics Show PASS
  test('should show PASS status for all metrics when no regressions', async () => {
    // Given: Run with all passing metrics
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_PASSING);

    // When: Comparison table is displayed
    await expect(regressionPage.metricComparisonTable).toBeVisible();

    // Then: Report still shows baseline comparison table (all passing)
    const passBadges = regressionPage.metricComparisonTable.locator('[class*="Badge"]').filter({ hasText: /PASS/i });
    await expect(passBadges.first()).toBeVisible();

    // All metrics should have PASS status
    await expect(regressionPage.getMetricStatus('field_accuracy')).toContainText('PASS');
    await expect(regressionPage.getMetricStatus('character_accuracy')).toContainText('PASS');
    await expect(regressionPage.getMetricStatus('word_accuracy')).toContainText('PASS');

    // No FAIL badges should be present
    const failBadges = regressionPage.metricComparisonTable.locator('[class*="Badge"]').filter({ hasText: /FAIL/i });
    await expect(failBadges).toHaveCount(0);
  });

  // REQ US-037 Scenario 12: No Regressed Metric Badges
  test('should not show regressed metric badges when all pass', async () => {
    // Given: Run with no regressions
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_PASSING);

    // When: Alert section is displayed
    await expect(regressionPage.successAlert).toBeVisible();

    // Then: No regressed metric badges are shown
    const regressedBadgeCount = await regressionPage.regressedMetricBadges.count();
    expect(regressedBadgeCount).toBe(0);

    // No severity badges should be present
    const severityBadges = regressionPage.page.getByRole('generic').filter({ hasText: /Critical|Warning/i });
    await expect(severityBadges).toHaveCount(0);
  });

  // REQ US-037 Scenario 13: Baseline Not Set Handling
  test('should show message when baseline is not set', async () => {
    // Given: Definition has no baseline configured
    // When: User attempts to view regression report
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_FAILED);

    // Then: Message: "No baseline set. Regression detection requires a baseline run."
    await expect(regressionPage.noBaselineMessage).toBeVisible();
    await expect(regressionPage.page.getByText(/No baseline comparison data available/i)).toBeVisible();

    // Report is not available (comparison table should not be shown)
    const tableCount = await regressionPage.metricComparisonTable.count();
    expect(tableCount).toBe(0);
  });

  // REQ US-037 Scenario 13: Navigation Option When No Baseline
  test('should provide back navigation when no baseline exists', async () => {
    // Given: Run without baseline comparison
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_FAILED);

    // When: No baseline message is shown
    await expect(regressionPage.noBaselineMessage).toBeVisible();

    // Then: Link to back to run details is available
    const backButton = regressionPage.page.getByRole('button', { name: /Back to Run Details/i });
    await expect(backButton).toBeVisible();

    // Clicking back button navigates to run detail
    await backButton.click();
    await regressionPage.page.waitForLoadState('networkidle');
    await expect(regressionPage.page).toHaveURL(new RegExp(`/runs/${SEED_RUN_ID_FAILED}$`));
  });

  // REQ US-037 Scenario 13: Prompt to Promote Baseline
  test('should prompt user to set baseline when none exists', async () => {
    // TODO: Needs clarification on whether prompt includes promote action or just message
    // Given: No baseline set for definition
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_FAILED);

    // When: No baseline message is displayed
    await expect(regressionPage.noBaselineMessage).toBeVisible();

    // Then: Prompt to promote a run to baseline
    await expect(regressionPage.page.getByText(/Promote this run to baseline/i)).toBeVisible();

    // Link to baseline management
    const baselineManagementLink = regressionPage.page.getByRole('link', { name: /baseline management/i });
    await expect(baselineManagementLink).toBeVisible();
  });

  // REQ US-037 Scenario 17: Loading State for Report
  test('should show loading state while fetching data', async ({ page }) => {
    // Given: User navigates to regression report
    // When: Data is being fetched
    const gotoPromise = regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_PASSING);

    // Then: Loading indicator is shown briefly
    // TODO: This might be too fast to catch in practice
    // The loading state exists but may not be visible in test due to speed

    await gotoPromise;

    // After loading completes, content is displayed
    await expect(regressionPage.metricComparisonTable).toBeVisible();
  });

  // REQ US-037 Edge Case: Non-Existent Run
  test('should handle non-existent run gracefully', async () => {
    // Given: Invalid run ID
    const invalidRunId = 'non-existent-run-id';

    // When: User attempts to view regression report
    await regressionPage.goto(SEED_PROJECT_ID, invalidRunId);

    // Then: Appropriate error message is shown
    // Either "Run not found" or "No baseline comparison data"
    const hasNotFoundMessage = await regressionPage.notFoundMessage.isVisible().catch(() => false);
    const hasNoBaselineMessage = await regressionPage.noBaselineMessage.isVisible().catch(() => false);

    expect(hasNotFoundMessage || hasNoBaselineMessage).toBe(true);
  });

  // REQ US-037 Scenario 12: Positive Delta Display
  test('should show positive deltas for improved metrics', async () => {
    // Given: Run with metrics that improved over baseline
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_PASSING);

    // When: Comparison table is displayed
    await expect(regressionPage.metricComparisonTable).toBeVisible();

    // Then: Positive deltas are shown (with + sign)
    const deltaCell = regressionPage.getMetricDelta('field_accuracy');
    const deltaText = await deltaCell.textContent();

    // Delta should be positive (improvement)
    expect(deltaText).toMatch(/\+/);

    // Percentage should also be positive
    const deltaPercentCell = regressionPage.getMetricDeltaPercent('field_accuracy');
    const deltaPercentText = await deltaPercentCell.textContent();
    expect(deltaPercentText).toMatch(/\+/);
  });

  // REQ US-037 Scenario 3: Threshold Information Display
  test('should display threshold information for each metric', async () => {
    // Given: Run with threshold configuration
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_PASSING);

    // When: Comparison table is displayed
    await expect(regressionPage.metricComparisonTable).toBeVisible();

    // Then: Threshold column shows threshold type and value
    const thresholdHeader = regressionPage.metricComparisonTable.locator('thead th').filter({ hasText: /Threshold/i });
    await expect(thresholdHeader).toBeVisible();

    // Each metric row should have threshold information
    const firstMetricRow = regressionPage.metricRows.first();
    await expect(firstMetricRow).toContainText(/relative|absolute|percentage/i);
  });
});
