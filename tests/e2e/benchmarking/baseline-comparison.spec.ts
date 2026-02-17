import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from '../helpers/auth';
import { RunDetailPage } from '../pages/RunDetailPage';
import { ProjectDetailPage } from '../pages/ProjectDetailPage';

/**
 * Test Plan: US-034 - Baseline Management - Comparison Scenarios
 * Tests comparing runs against baseline and regression detection
 */
test.describe('Baseline Comparison', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  const SEED_PROJECT_ID = 'seed-project-invoice-extraction';
  const SEED_DEFINITION_ID = 'seed-definition-baseline';
  const SEED_RUN_ID_COMPLETED = 'seed-run-completed-001'; // Baseline run
  const SEED_RUN_ID_PASSING = 'seed-run-passing-004'; // Passing comparison
  const SEED_RUN_ID_REGRESSED = 'seed-run-regressed-005'; // Regressed comparison
  const SEED_RUN_ID_FAILED = 'seed-run-failed-003'; // Failed run (no comparison)

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

  // REQ US-034 Scenario 3: Baseline Badge Display
  test('should display baseline badge in run detail header', async () => {
    // Given: Run is marked as baseline
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    // When: Run detail is displayed
    // Then: Prominent "BASELINE" badge is shown
    await expect(runDetailPage.baselineBadge).toBeVisible();
    await expect(runDetailPage.baselineBadge).toContainText('BASELINE');

    // Badge has appropriate styling (yellow/gold or distinct)
    // Note: Visual verification would require screenshot comparison or CSS inspection
  });

  // REQ US-034 Scenario 3: Baseline Badge in Run Info Table
  test('should show baseline status in run information table', async () => {
    // Given: Baseline run
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    // When: Run information card is displayed
    // Then: "Is Baseline" field shows "Yes"
    const isBaselineValue = runDetailPage.getIsBaselineValue();
    await expect(isBaselineValue).toBeVisible();
    await expect(isBaselineValue).toContainText('Yes');

    // For non-baseline run
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_PASSING);
    const nonBaselineValue = runDetailPage.getIsBaselineValue();
    await expect(nonBaselineValue).toContainText('No');
  });

  // REQ US-034 Scenario 4: Compare New Run Against Baseline
  test('should display comparison section with metrics delta', async () => {
    // Given: Baseline run exists and new run completes for same definition
    // When: User views the new run's detail page (passing run)
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_PASSING);

    // Then: Comparison section displays
    await expect(runDetailPage.baselineComparisonHeading).toBeVisible();
    await expect(runDetailPage.baselineComparisonTable).toBeVisible();

    // Verify table has columns: Metric, Current, Baseline, Delta, Delta %, Status
    const tableHeaders = runDetailPage.baselineComparisonTable.locator('thead th');
    await expect(tableHeaders).toContainText(['Metric', 'Current', 'Baseline', 'Delta', 'Delta %', 'Status']);

    // Verify metrics are displayed
    const tableRows = runDetailPage.baselineComparisonTable.locator('tbody tr');
    await expect(tableRows).toHaveCount(3); // field_accuracy, character_accuracy, word_accuracy

    // Verify delta values are shown
    await expect(runDetailPage.baselineComparisonTable).toContainText('0.9600');
    await expect(runDetailPage.baselineComparisonTable).toContainText('0.9500');
    await expect(runDetailPage.baselineComparisonTable).toContainText('+0.0100');

    // Verify pass/fail status per metric
    const statusBadges = runDetailPage.baselineComparisonTable.locator('[class*="Badge"]');
    await expect(statusBadges.first()).toContainText('PASS');
  });

  // REQ US-034 Scenario 4: Overall Pass/Fail Status
  test('should show overall pass status for passing run', async () => {
    // Given: New run meets baseline thresholds
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_PASSING);

    // When: Comparison results are displayed
    // Then: Overall status shows passed (via alert or badge)
    await expect(runDetailPage.baselineComparisonAlert).toBeVisible();
    await expect(runDetailPage.baselineComparisonAlert).toContainText('PASSED');

    // No regression indicators
    const regressedMetrics = runDetailPage.getRegressedMetrics();
    await expect(regressedMetrics).toHaveCount(0);
  });

  // REQ US-034 Scenario 5: Regression Alert Display
  test('should flag run with regression tag when metrics fall below threshold', async () => {
    // Given: New run's metrics fall below baseline threshold
    // When: Comparison results are calculated (regressed run)
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    // Then: Run is flagged with "REGRESSION" or alert
    await expect(runDetailPage.baselineComparisonAlert).toBeVisible();
    await expect(runDetailPage.baselineComparisonAlert).toContainText(/FAILED|REGRESSION/i);

    // Regressed metrics are highlighted in red
    const regressedMetrics = runDetailPage.getRegressedMetrics();
    await expect(regressedMetrics.first()).toBeVisible();

    // List of regressed metrics with deltas
    await expect(runDetailPage.baselineComparisonAlert).toContainText('field_accuracy');
    await expect(runDetailPage.baselineComparisonAlert).toContainText('character_accuracy');
    await expect(runDetailPage.baselineComparisonAlert).toContainText('word_accuracy');
  });

  // REQ US-034 Scenario 5: Regressed Metrics in Comparison Table
  test('should highlight regressed metrics in comparison table', async () => {
    // Given: Run with regressed metrics
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    // When: Comparison table is displayed
    await expect(runDetailPage.baselineComparisonTable).toBeVisible();

    // Then: Regressed metrics show FAIL status
    // Note: Mantine Badge renders 2 elements per badge, so we check for table rows with FAIL
    const failRows = runDetailPage.baselineComparisonTable.locator('tbody tr').filter({ hasText: /FAIL/i });
    await expect(failRows).toHaveCount(3); // All 3 metrics regressed in seed data

    // Delta values are negative and colored red
    const negativeDeltas = runDetailPage.baselineComparisonTable.locator('code').filter({ hasText: /-/ });
    await expect(negativeDeltas.first()).toBeVisible();

    // Verify specific regressed values
    await expect(runDetailPage.baselineComparisonTable).toContainText('0.8800'); // field_accuracy current
    await expect(runDetailPage.baselineComparisonTable).toContainText('0.9500'); // field_accuracy baseline
    await expect(runDetailPage.baselineComparisonTable).toContainText('-0.0700'); // delta
  });

  // REQ US-034 Scenario 6: Passing Comparison Display
  test('should show green indicators for passing comparison', async () => {
    // Given: New run's metrics meet or exceed baseline thresholds
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_PASSING);

    // When: Comparison results are displayed
    // Then: Overall status shows "PASSED" with green checkmark
    await expect(runDetailPage.baselineComparisonAlert).toContainText('PASSED');

    // All metrics show within-threshold or improved
    // Note: Mantine Badge renders 2 elements per badge, so we check for table rows with PASS
    const passRows = runDetailPage.baselineComparisonTable.locator('tbody tr').filter({ hasText: /PASS/i });
    await expect(passRows).toHaveCount(3); // All metrics passed

    // No regression alerts
    await expect(runDetailPage.baselineComparisonAlert).not.toContainText(/FAILED|REGRESSION/i);

    // User can see the run is acceptable
    await expect(runDetailPage.baselineComparisonAlert).toContainText(/All metrics meet or exceed the baseline thresholds/i);
  });

  // REQ US-034 Scenario 13: Comparison Without Baseline
  test('should not show baseline prompt when comparison exists', async () => {
    // Given: Run has baseline comparison
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_PASSING);

    // Then: No baseline prompt is shown (since comparison exists)
    const noBaselineAlert = runDetailPage.page.locator('[data-testid="no-baseline-alert"]');
    await expect(noBaselineAlert).not.toBeVisible();

    // And baseline comparison is shown instead
    await expect(runDetailPage.baselineComparisonHeading).toBeVisible();
    await expect(runDetailPage.baselineComparisonTable).toBeVisible();
  });

  // REQ US-034 Scenario 14: Regression Indicator in Run List
  test('should show regression indicator in project run list', async ({ page }) => {
    // Given: Run list contains runs with regressions
    await projectDetailPage.goto(SEED_PROJECT_ID);

    // When: Run list is displayed
    const runsTable = projectDetailPage.runsTable;
    await expect(runsTable).toBeVisible();

    // Then: Runs with regressions show warning icon/badge
    const regressedRunRow = page.locator(`[data-testid="run-row-${SEED_RUN_ID_REGRESSED}"]`);
    await expect(regressedRunRow).toBeVisible();

    // Verify regression indicator badge is displayed
    const regressionBadge = regressedRunRow.locator('[class*="Badge"]').filter({ hasText: /regressed/i }).first();
    await expect(regressionBadge).toBeVisible();
    await expect(regressionBadge).toContainText('3 regressed'); // 3 metrics regressed
  });

  // REQ US-034 Scenario 8: View Baseline from Definition Detail
  test('should show baseline summary in definition detail', async ({ page }) => {
    // Given: Definition has a baseline run set
    await projectDetailPage.goto(SEED_PROJECT_ID);

    // When: User clicks on the definition to view details
    const definitionRow = page.locator(`[data-testid="definition-row-${SEED_DEFINITION_ID}"]`);
    await definitionRow.click();

    // Then: Baseline information card is displayed
    const baselineCard = page.locator('[data-testid="baseline-info-card"]');
    await expect(baselineCard).toBeVisible();

    // Link to the baseline run
    const viewBaselineBtn = page.locator('[data-testid="view-baseline-run-btn"]');
    await expect(viewBaselineBtn).toBeVisible();

    // Key baseline metrics summary
    const metricsTable = page.locator('[data-testid="baseline-metrics-table"]');
    await expect(metricsTable).toBeVisible();
    await expect(metricsTable).toContainText('field_accuracy');
    await expect(metricsTable).toContainText('0.9500');

    // Threshold configuration summary
    const thresholdsTable = page.locator('[data-testid="baseline-thresholds-table"]');
    await expect(thresholdsTable).toBeVisible();
    await expect(thresholdsTable).toContainText('field_accuracy');
    await expect(thresholdsTable).toContainText('Relative (%)');
    await expect(thresholdsTable).toContainText('95%');
  });

  // REQ US-034 Scenario 15: Historical Baseline Changes
  test('should show baseline change history', async ({ page }) => {
    // Given: Definition has baseline promotion history
    await projectDetailPage.goto(SEED_PROJECT_ID);

    // When: User views the definition detail page
    const definitionRow = page.locator(`[data-testid="definition-row-${SEED_DEFINITION_ID}"]`);
    await definitionRow.click();

    // Then: Baseline history section is displayed
    const historyHeading = page.locator('[data-testid="baseline-history-heading"]');
    await expect(historyHeading).toBeVisible();
    await expect(historyHeading).toContainText('Baseline Change History');

    // History table shows baseline changes
    const historyTable = page.locator('[data-testid="baseline-history-table"]');
    await expect(historyTable).toBeVisible();

    // Each entry shows: date, promoted run, user who promoted
    const firstRow = page.locator('[data-testid="baseline-history-row-0"]');
    await expect(firstRow).toBeVisible();

    // Date is displayed
    const dateCell = page.locator('[data-testid="baseline-history-date-0"]');
    await expect(dateCell).toBeVisible();

    // Run ID link is displayed
    const runLink = page.locator('[data-testid="baseline-history-run-link-0"]');
    await expect(runLink).toBeVisible();
    await expect(runLink).toContainText(SEED_RUN_ID_COMPLETED.substring(0, 12));

    // User is displayed
    const userCell = page.locator('[data-testid="baseline-history-user-0"]');
    await expect(userCell).toBeVisible();
    await expect(userCell).toContainText('test-user');
  });
});
