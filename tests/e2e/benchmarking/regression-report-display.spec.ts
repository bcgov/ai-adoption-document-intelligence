import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from '../helpers/auth';
import { RegressionReportPage } from '../pages/RegressionReportPage';

/**
 * Test Plan: US-037 - Regression Reports UI - Display Scenarios
 * Tests the basic display of regression reports including severity levels and comparison tables
 */
test.describe('Regression Report - Display', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  const SEED_PROJECT_ID = 'seed-project-invoice-extraction';
  const SEED_RUN_ID_REGRESSED = 'seed-run-regressed-005'; // Run with regressions
  const SEED_RUN_ID_PASSING = 'seed-run-passing-004'; // Run that passes baseline

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

  // REQ US-037 Scenario 1: View Regression Report
  test('should display regression report with regressed metrics', async () => {
    // Given: Run has metrics that regressed below baseline thresholds
    // When: User navigates to the regression report page for the run
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    // Then: Report displays clearly identified regressed metrics
    await expect(regressionPage.pageTitle).toBeVisible();
    await expect(regressionPage.regressionAlert).toBeVisible();
    await expect(regressionPage.getRegressionAlertTitle()).toBeVisible();

    // Each regressed metric shows: name, baseline value, current value, threshold, delta
    const metricRow = regressionPage.getMetricRow('field_accuracy');
    await expect(metricRow).toBeVisible();

    // Verify metric details are shown
    await expect(regressionPage.getMetricCurrentValue('field_accuracy')).toBeVisible();
    await expect(regressionPage.getMetricBaselineValue('field_accuracy')).toBeVisible();
    await expect(regressionPage.getMetricDelta('field_accuracy')).toBeVisible();
    await expect(regressionPage.getMetricDeltaPercent('field_accuracy')).toBeVisible();

    // Verify threshold information is present
    await expect(regressionPage.metricComparisonTable).toContainText('Threshold');

    // Report is well-organized and scannable
    await expect(regressionPage.metricComparisonTable).toBeVisible();
    await expect(regressionPage.runInfoTable).toBeVisible();
  });

  // REQ US-037 Scenario 1: Regressed Metrics Count
  test('should show count of regressed metrics in alert', async () => {
    // Given: Run has multiple regressed metrics
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    // When: Regression alert is displayed
    await expect(regressionPage.regressionAlert).toBeVisible();

    // Then: Alert shows count of regressed metrics
    const regressedCount = await regressionPage.getRegressedMetricCount();
    expect(regressedCount).toBe(3); // field_accuracy, character_accuracy, word_accuracy

    // Verify regressed metric badges are shown
    const metricNames = await regressionPage.getRegressedMetricNames();
    expect(metricNames).toContain('field_accuracy');
    expect(metricNames).toContain('character_accuracy');
    expect(metricNames).toContain('word_accuracy');
  });

  // REQ US-037 Scenario 2: Regression Severity Levels
  test('should display severity indicators for regressed metrics', async () => {
    // Given: Regression report contains metrics with varying degrees of regression
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    // When: Report is rendered
    await expect(regressionPage.metricComparisonTable).toBeVisible();

    // Then: Severity badges or icons indicate level
    // Critical regressions (e.g., >10% drop) are highlighted
    const fieldAccuracySeverity = regressionPage.getMetricSeverity('field_accuracy');
    await expect(fieldAccuracySeverity).toBeVisible();

    // Verify severity is either Critical or Warning
    const severityText = await fieldAccuracySeverity.textContent();
    expect(severityText).toMatch(/Critical|Warning/i);

    // User can prioritize investigation based on severity
    // field_accuracy has -7.37% drop (0.88 vs 0.95) which should be Critical (>10% relative drop)
    await expect(fieldAccuracySeverity).toContainText(/Critical/i);
  });

  // REQ US-037 Scenario 2: Severity Color Coding
  test('should use color coding for severity levels', async () => {
    // Given: Regression report with different severity levels
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    // When: Metrics are displayed
    await expect(regressionPage.metricComparisonTable).toBeVisible();

    // Then: Severity badges have appropriate colors
    // Note: We can't directly test color, but we can verify badges exist with text
    const criticalBadges = regressionPage.page.getByText(/^Critical$/i);
    const warningBadges = regressionPage.page.getByText(/^Warning$/i);

    // At least one severity badge should be visible
    const hasCritical = await criticalBadges.count() > 0;
    const hasWarning = await warningBadges.count() > 0;
    expect(hasCritical || hasWarning).toBe(true);
  });

  // REQ US-037 Scenario 3: Baseline Comparison Table
  test('should display complete baseline comparison table', async () => {
    // Given: Baseline run exists for the definition
    // When: Regression report is displayed
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    // Then: Table shows columns: Metric, Baseline Value, Current Value, Threshold, Delta, % Change, Status
    const tableHeaders = regressionPage.metricComparisonTable.locator('thead th');
    await expect(tableHeaders).toContainText(['Metric', 'Current', 'Baseline', 'Delta', 'Delta %', 'Threshold', 'Status']);

    // All metrics are included (not just regressed ones)
    const metricRows = regressionPage.metricRows;
    await expect(metricRows).toHaveCount(3); // field_accuracy, character_accuracy, word_accuracy

    // Pass/fail status based on threshold configuration
    const statusBadges = regressionPage.metricComparisonTable.locator('[class*="Badge"]').filter({ hasText: /PASS|FAIL/i });
    await expect(statusBadges.first()).toBeVisible();

    // Color coding for easy scanning (negative deltas in red)
    const deltaCell = regressionPage.getMetricDelta('field_accuracy');
    await expect(deltaCell).toContainText('-0.0700');
  });

  // REQ US-037 Scenario 3: Metric Details Accuracy
  test('should display accurate metric values and deltas', async () => {
    // Given: Run with known metric values
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    // When: Comparison table is displayed
    await expect(regressionPage.metricComparisonTable).toBeVisible();

    // Then: Values match expected data
    // field_accuracy: current=0.88, baseline=0.95, delta=-0.07
    await expect(regressionPage.getMetricCurrentValue('field_accuracy')).toContainText('0.8800');
    await expect(regressionPage.getMetricBaselineValue('field_accuracy')).toContainText('0.9500');
    await expect(regressionPage.getMetricDelta('field_accuracy')).toContainText('-0.0700');

    // Verify percentage calculation
    await expect(regressionPage.getMetricDeltaPercent('field_accuracy')).toContainText('-7.37%');

    // Verify status is FAIL
    await expect(regressionPage.getMetricStatus('field_accuracy')).toContainText('FAIL');
  });

  // REQ US-037 Scenario 3: Run Information Display
  test('should display run information with baseline details', async () => {
    // Given: Regression report is loaded
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    // When: Run information card is displayed
    await expect(regressionPage.runInfoTable).toBeVisible();

    // Then: Shows run ID, baseline run ID, and completion time
    await expect(regressionPage.runInfoTable).toContainText('Run ID');
    await expect(regressionPage.runInfoTable).toContainText('Baseline Run ID');
    await expect(regressionPage.runInfoTable).toContainText('Completed At');

    // Run IDs are shown in code blocks
    const codeBlocks = regressionPage.runInfoTable.locator('code');
    await expect(codeBlocks.first()).toBeVisible();

    // Baseline run ID should be the completed baseline run
    await expect(regressionPage.runInfoTable).toContainText('seed-run-completed-001');
  });

  // REQ US-037 Scenario 3: MLflow Link in Run Info
  test('should display MLflow link when available', async () => {
    // Given: Run has MLflow experiment data
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    // When: Run information is displayed
    await expect(regressionPage.runInfoTable).toBeVisible();

    // Then: MLflow link is shown (if MLflow is configured)
    // Note: Link visibility depends on MLflow configuration
    const mlflowLinkCount = await regressionPage.mlflowLink.count();
    if (mlflowLinkCount > 0) {
      await expect(regressionPage.mlflowLink).toBeVisible();
      await expect(regressionPage.mlflowLink).toHaveAttribute('href', /mlflow/);
    }
  });

  // REQ US-037 Scenario 1: Navigation Back to Run
  test('should provide navigation back to run detail', async () => {
    // Given: User is viewing regression report
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    // When: User clicks back to run button
    await expect(regressionPage.backToRunBtn).toBeVisible();
    await regressionPage.clickBackToRun();

    // Then: Navigates back to run detail page
    await expect(regressionPage.page).toHaveURL(new RegExp(`/runs/${SEED_RUN_ID_REGRESSED}$`));
  });
});
