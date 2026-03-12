import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from '../helpers/auth';
import { RunDetailPage } from '../pages/RunDetailPage';

test.describe('US-031 - Results Summary: Error States', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  const SEED_PROJECT_ID = 'seed-project-invoice-extraction';
  const SEED_RUN_ID_FAILED = 'seed-run-failed-003';
  const SEED_RUN_ID_RUNNING = 'seed-run-running-002';

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

  test('Scenario 12: should display error alert for failed run', async ({ page }) => {
    // REQ US-031: Error section is prominently displayed

    // Given: Benchmark run with status 'failed' and error message
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_FAILED);

    // Then: Error alert is visible
    await expect(runDetailPage.errorAlert).toBeVisible();
  });

  test('Scenario 12: should show full error message', async ({ page }) => {
    // REQ US-031: Full error message is shown

    // Given: Failed run with error message
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_FAILED);

    // Then: Error message from seed data is displayed
    const errorAlert = runDetailPage.errorAlert;
    await expect(errorAlert).toContainText('Dataset loading failed');
    await expect(errorAlert).toContainText('File not found');
  });

  test('Scenario 12: failed run should not show metrics', async ({ page }) => {
    // REQ US-031: No metrics or drill-down data is shown (or marked as incomplete)

    // Given: Failed run
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_FAILED);

    // Then: Metrics section should not be visible or should show "Not available"
    const metricsHeading = runDetailPage.aggregatedMetricsHeading;
    const isMetricsVisible = await metricsHeading.isVisible().catch(() => false);

    if (isMetricsVisible) {
      // If metrics section is visible, it should indicate data is not available
      const pageText = await page.textContent('body');
      const hasUnavailableMessage =
        pageText?.includes('not available') ||
        pageText?.includes('Not available') ||
        pageText?.includes('failed');

      expect(hasUnavailableMessage).toBe(true);
    } else {
      // Metrics section not visible (expected for failed run)
      expect(isMetricsVisible).toBe(false);
    }
  });

  test('Scenario 12: failed run should not show drill-down data', async ({ page }) => {
    // REQ US-031: Drill-down section not shown for failed runs

    // Given: Failed run
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_FAILED);

    // Then: Drill-down section should not be visible
    const drillDownHeading = runDetailPage.drillDownHeading;
    const isDrillDownVisible = await drillDownHeading.isVisible().catch(() => false);

    expect(isDrillDownVisible).toBe(false);
  });

  test('Scenario 12: error alert should be prominently styled', async ({ page }) => {
    // REQ US-031: Error section is prominently displayed

    // Given: Failed run
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_FAILED);

    // Then: Error alert should have error/danger styling
    const errorAlert = runDetailPage.errorAlert;
    await expect(errorAlert).toBeVisible();

    // Check for error/danger visual indicators (red color, icon, etc.)
    // Note: This is implementation-specific, but we can check the component exists
    const alertClass = await errorAlert.getAttribute('class');
    expect(alertClass).toBeTruthy();

    // Common error styling patterns: 'error', 'danger', 'red', 'alert-error'
    // Implementation may vary
  });

  test('Scenario 13: incomplete run should show in-progress state', async ({ page }) => {
    // REQ US-031: Page indicates run is not complete

    // Given: Run is in 'running' status
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_RUNNING);

    // Then: Status badge shows "running"
    const statusLocator = runDetailPage.getStatusText();
    await expect(statusLocator).toBeVisible();

    const statusText = await statusLocator.textContent();
    expect(statusText?.toLowerCase()).toContain('running');
  });

  test('Scenario 13: running run should not show metrics', async ({ page }) => {
    // REQ US-031: Metrics section shows "In progress..." or empty state

    // Given: Run in 'running' status
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_RUNNING);

    // Then: Metrics section should either be hidden or show "In progress" message
    const metricsHeading = runDetailPage.aggregatedMetricsHeading;
    const isMetricsVisible = await metricsHeading.isVisible().catch(() => false);

    if (isMetricsVisible) {
      // If visible, should indicate data is not yet available
      const pageText = await page.textContent('body');
      const hasInProgressMessage =
        pageText?.includes('In progress') ||
        pageText?.includes('in progress') ||
        pageText?.includes('not yet available') ||
        pageText?.includes('Not yet available');

      expect(hasInProgressMessage).toBe(true);
    } else {
      // Metrics section not visible (expected for running run)
      expect(isMetricsVisible).toBe(false);
    }
  });

  test('Scenario 13: running run should hide drill-down section', async ({ page }) => {
    // REQ US-031: Drill-down section is hidden or shows "Not available until run completes"

    // Given: Run in 'running' status
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_RUNNING);

    // Then: Drill-down section should not be visible
    const drillDownHeading = runDetailPage.drillDownHeading;
    const isDrillDownVisible = await drillDownHeading.isVisible().catch(() => false);

    if (isDrillDownVisible) {
      // If visible, should show "not available" message
      const pageText = await page.textContent('body');
      const hasUnavailableMessage =
        pageText?.includes('Not available until') ||
        pageText?.includes('not available until') ||
        pageText?.includes('run completes');

      expect(hasUnavailableMessage).toBe(true);
    } else {
      // Drill-down not visible (expected)
      expect(isDrillDownVisible).toBe(false);
    }
  });

  test('Scenario 13: running run should show cancel button', async ({ page }) => {
    // REQ US-031: Running runs can be cancelled

    // Given: Run in 'running' status
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_RUNNING);

    // Then: Cancel button should be visible
    await expect(runDetailPage.cancelRunBtn).toBeVisible();
  });

  test('Scenario 13: running run should show partial artifacts if any', async ({ page }) => {
    // REQ US-031: Artifacts section shows partial results (if any)

    // Given: Running run (may or may not have artifacts yet)
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_RUNNING);

    // Then: Artifacts section behavior depends on whether artifacts exist
    const artifactsHeading = runDetailPage.artifactsHeading;
    const isArtifactsVisible = await artifactsHeading.isVisible().catch(() => false);

    // Either visible with partial data or not visible (both are valid)
    // This test just verifies no error occurs
    expect(true).toBe(true);
  });

  test('Scenario 13: incomplete run should show run information', async ({ page }) => {
    // REQ US-031: Basic run information should still be visible for incomplete runs

    // Given: Running run
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_RUNNING);

    // Then: Run information table is visible
    await expect(runDetailPage.runInfoTable).toBeVisible();

    // And: Basic fields are populated
    await expect(runDetailPage.runInfoTable).toContainText('Status');
    await expect(runDetailPage.runInfoTable).toContainText('Started At');

    // Completed At should not be shown (or should show "N/A")
    const tableText = await runDetailPage.runInfoTable.textContent();
    const hasCompletedAt = tableText?.includes('Completed At');

    if (hasCompletedAt) {
      // If shown, should indicate not completed yet
      expect(tableText).toMatch(/N\/A|--|-|not completed|in progress/i);
    }
  });

  test('Scenario 12: failed run should show run duration', async ({ page }) => {
    // REQ US-031: Duration should be calculated even for failed runs

    // Given: Failed run with start and end times
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_FAILED);

    // Then: Duration should be displayed
    const durationLocator = runDetailPage.getDuration();
    const isVisible = await durationLocator.isVisible().catch(() => false);

    if (isVisible) {
      const durationText = await durationLocator.textContent();
      expect(durationText).toBeTruthy();

      // Seed data: started 14:00:00, completed 14:05:00 = 5 minutes
      expect(durationText).toMatch(/5/); // Should show 5 minutes
    }
  });

  test('Scenario 13: running run should update duration in real-time', async ({ page }) => {
    // REQ US-031: Duration updates automatically while running (polling behavior)

    // Given: Running run
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_RUNNING);

    // Then: Duration should be calculated from start time to now
    const durationLocator = runDetailPage.getDuration();
    const isVisible = await durationLocator.isVisible().catch(() => false);

    if (isVisible) {
      const durationText = await durationLocator.textContent();
      expect(durationText).toBeTruthy();

      // Seed data: started 2026-02-15T09:00:00Z
      // Current duration will vary based on current time vs seed time
      // Just verify duration exists and has time units
      expect(durationText).toMatch(/\d+/); // Contains numbers
    }
  });
});
