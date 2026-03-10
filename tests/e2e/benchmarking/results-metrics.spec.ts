import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from '../helpers/auth';
import { RunDetailPage } from '../pages/RunDetailPage';

test.describe('US-031 - Results Summary: Metrics & Duration', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  const SEED_PROJECT_ID = 'seed-project-invoice-extraction';
  const SEED_RUN_ID_COMPLETED = 'seed-run-completed-001';

  let runDetailPage: RunDetailPage;

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
  });

  test('Scenario 1: should display aggregated metrics for completed run', async ({ page }) => {
    // REQ US-031: Run detail page shows aggregated metrics

    // Given: Completed benchmark run with aggregated metrics
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    // Then: Metrics table is displayed showing metric names and values
    await expect(runDetailPage.aggregatedMetricsHeading).toBeVisible();
    await expect(runDetailPage.aggregatedMetricsTable).toBeVisible();

    // Verify metrics from seed data are present
    const metricsTable = runDetailPage.aggregatedMetricsTable;
    await expect(metricsTable).toContainText('field_accuracy');
    await expect(metricsTable).toContainText('0.95'); // From seed data
    await expect(metricsTable).toContainText('character_accuracy');
    await expect(metricsTable).toContainText('0.98');
    await expect(metricsTable).toContainText('word_accuracy');
    await expect(metricsTable).toContainText('0.96');
  });

  test('Scenario 1: metrics should be formatted appropriately', async ({ page }) => {
    // REQ US-031: Values are formatted appropriately (percentages, decimals)

    // Given: Completed benchmark run with metrics
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    // Then: Metrics are displayed with appropriate decimal precision
    const metricsTable = runDetailPage.aggregatedMetricsTable;

    // Check that values are displayed as decimals (not as percentages since seed uses 0.95, not 95)
    const tableText = await metricsTable.textContent();
    expect(tableText).toBeTruthy();

    // Verify decimal format (should have 2-4 decimal places)
    expect(tableText).toMatch(/0\.9[0-9]{1,2}/); // Matches values like 0.95, 0.98
  });

  test('Scenario 11: should display run duration prominently', async ({ page }) => {
    // REQ US-031: Total duration is prominently displayed

    // Given: Completed run with startedAt and completedAt timestamps
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    // Then: Duration is displayed in run information table
    await expect(runDetailPage.runInfoTable).toBeVisible();

    const durationLocator = runDetailPage.getDuration();
    await expect(durationLocator).toBeVisible();

    // The seed data has:
    // startedAt: 2026-02-10T10:00:00Z
    // completedAt: 2026-02-10T10:45:00Z
    // Duration should be 45 minutes
    const durationText = await durationLocator.textContent();
    expect(durationText).toBeTruthy();
    expect(durationText).toContain('45'); // 45 minutes
  });

  test('Scenario 11: should display start and end times', async ({ page }) => {
    // REQ US-031: Start time and end time are also shown

    // Given: Completed run with timestamps
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    // Then: Started At and Completed At are visible in run info table
    const runInfoTable = runDetailPage.runInfoTable;
    await expect(runInfoTable).toContainText('Started At');
    await expect(runInfoTable).toContainText('Completed At');

    // Verify the timestamps contain date information
    const tableText = await runInfoTable.textContent();
    expect(tableText).toBeTruthy();
    expect(tableText).toMatch(/202[0-9]/); // Contains year in 2020s
  });

  test('Scenario 11: duration should be calculated accurately', async ({ page }) => {
    // REQ US-031: Duration is calculated accurately

    // Given: Completed run with known timestamps
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    // Then: Duration calculation is correct
    const durationLocator = runDetailPage.getDuration();
    const durationText = await durationLocator.textContent();

    // Seed data: start 10:00:00, end 10:45:00 = 45 minutes
    expect(durationText).toBeTruthy();

    // Accept various human-readable formats:
    // "45m", "45 min", "45 minutes", "0h 45m", etc.
    const hasMinutes = durationText!.includes('45');
    const hasMinutesUnit = /45\s?(m|min|minutes)/i.test(durationText!);

    expect(hasMinutes).toBe(true);
    expect(hasMinutesUnit).toBe(true);
  });

  test('Scenario 1: should display all metrics from BenchmarkRun.metrics', async ({ page }) => {
    // REQ US-031: All metrics from BenchmarkRun.metrics are shown

    // Given: Completed run with multiple metrics
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    // Then: All three metrics from seed data are present
    const metricsTable = runDetailPage.aggregatedMetricsTable;

    // Seed data includes: field_accuracy, character_accuracy, word_accuracy
    await expect(metricsTable).toContainText('field_accuracy');
    await expect(metricsTable).toContainText('character_accuracy');
    await expect(metricsTable).toContainText('word_accuracy');

    // Count the number of metric rows (excluding header)
    const rows = metricsTable.locator('tbody tr');
    const rowCount = await rows.count();

    // Should have at least 3 metrics (may include nested metrics from perSampleResults, etc.)
    expect(rowCount).toBeGreaterThanOrEqual(3);
  });
});
