import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from '../helpers/auth';
import { RegressionReportPage } from '../pages/RegressionReportPage';

/**
 * Test Plan: US-037 - Regression Reports UI - Export Functionality
 * Tests exporting regression reports in various formats (JSON, HTML, PDF)
 */
test.describe('Regression Report - Exports', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  const SEED_PROJECT_ID = 'seed-project-invoice-extraction';
  const SEED_RUN_ID_REGRESSED = 'seed-run-regressed-005';

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

  // REQ US-037 Scenario 5: Export Regression Report as PDF
  test.skip('should export regression report as PDF', async ({ page }) => {
    // TODO: PDF export not yet implemented (only JSON and HTML are available)
    // Given: Regression report is displayed
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    // When: User clicks "Export" and selects PDF format
    const downloadPromise = page.waitForEvent('download');
    // await page.getByRole('button', { name: /Export PDF/i }).click();

    // Then: PDF is generated and downloaded
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/regression-report.*\.pdf$/);

    // PDF contains: project/run metadata, regression summary, full metric table, charts
    // File is named appropriately (e.g., "regression-report-run-123.pdf")
    expect(download.suggestedFilename()).toContain('regression-report');
    expect(download.suggestedFilename()).toContain(SEED_RUN_ID_REGRESSED);
  });

  // REQ US-037 Scenario 6: Export Regression Report as HTML
  test('should export regression report as HTML', async ({ page }) => {
    // Given: Regression report is displayed
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    // When: User clicks "Export" and selects HTML format
    await expect(regressionPage.exportHtmlBtn).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await regressionPage.exportHtmlBtn.click();

    // Then: HTML file is downloaded
    const download = await downloadPromise;
    const filename = download.suggestedFilename();

    expect(filename).toMatch(/regression-report.*\.html$/);
    expect(filename).toContain('regression-report');

    // HTML is self-contained (includes styles, data)
    // Can be opened in any browser
    // Suitable for email sharing or archival
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
  });

  // REQ US-037 Scenario 6: HTML Export Filename Format
  test('should use proper naming convention for HTML export', async ({ page }) => {
    // Given: Regression report is displayed
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    // When: HTML export is triggered
    const downloadPromise = page.waitForEvent('download');
    await regressionPage.exportHtmlBtn.click();
    const download = await downloadPromise;

    // Then: Filename includes run ID and timestamp
    const filename = download.suggestedFilename();
    expect(filename).toMatch(/^regression-report-.*\.html$/);

    // Should contain timestamp or run identifier
    expect(filename.length).toBeGreaterThan('regression-report-.html'.length);
  });

  // REQ US-037 Scenario 7: Export Regression Report as JSON
  test('should export regression report as JSON', async ({ page }) => {
    // Given: Regression report is displayed
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    // When: User clicks "Export" and selects JSON format
    await expect(regressionPage.exportJsonBtn).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await regressionPage.exportJsonBtn.click();

    // Then: JSON file is downloaded
    const download = await downloadPromise;
    const filename = download.suggestedFilename();

    expect(filename).toMatch(/regression-report.*\.json$/);
    expect(filename).toContain('regression-report');

    // Suitable for programmatic analysis or CI integration
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
  });

  // REQ US-037 Scenario 7: JSON Export Content Structure
  test('should include complete data in JSON export', async ({ page }) => {
    // Given: Regression report is displayed
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    // When: JSON is exported
    const downloadPromise = page.waitForEvent('download');
    await regressionPage.exportJsonBtn.click();
    const download = await downloadPromise;

    // Then: JSON contains: run metadata, baseline metadata, all metrics with comparisons, regression flags
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();

    // Read and verify JSON structure
    if (downloadPath) {
      const fs = require('fs');
      const jsonContent = JSON.parse(fs.readFileSync(downloadPath, 'utf-8'));

      // Verify required fields
      expect(jsonContent).toHaveProperty('runId');
      expect(jsonContent).toHaveProperty('definitionName');
      expect(jsonContent).toHaveProperty('status');

      // Should have baseline comparison data
      expect(jsonContent).toHaveProperty('baselineComparison');
      expect(Array.isArray(jsonContent.baselineComparison)).toBe(true);

      // Metrics should include regression information
      expect(jsonContent.baselineComparison.length).toBeGreaterThan(0);

      const firstMetric = jsonContent.baselineComparison[0];
      expect(firstMetric).toHaveProperty('metricName');
      expect(firstMetric).toHaveProperty('currentValue');
      expect(firstMetric).toHaveProperty('baselineValue');
      expect(firstMetric).toHaveProperty('delta');
      expect(firstMetric).toHaveProperty('deltaPercent');
      expect(firstMetric).toHaveProperty('status');
    }
  });

  // REQ US-037 Scenario 7: JSON Export Filename Format
  test('should use proper naming convention for JSON export', async ({ page }) => {
    // Given: Regression report is displayed
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    // When: JSON export is triggered
    const downloadPromise = page.waitForEvent('download');
    await regressionPage.exportJsonBtn.click();
    const download = await downloadPromise;

    // Then: Filename includes run ID and timestamp
    const filename = download.suggestedFilename();
    expect(filename).toMatch(/^regression-report-.*\.json$/);

    // Should contain timestamp or run identifier
    expect(filename.length).toBeGreaterThan('regression-report-.json'.length);
  });

  // REQ US-037 Scenario 3: Export Buttons Availability
  test('should show export buttons on regression report page', async () => {
    // Given: Regression report is loaded
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    // When: Page is displayed
    // Then: Export buttons are visible and enabled
    await expect(regressionPage.exportJsonBtn).toBeVisible();
    await expect(regressionPage.exportHtmlBtn).toBeVisible();

    await expect(regressionPage.exportJsonBtn).toBeEnabled();
    await expect(regressionPage.exportHtmlBtn).toBeEnabled();
  });

  // REQ US-037 Scenario 5/6/7: Export from Passing Run
  test('should allow exporting report even when all metrics pass', async ({ page }) => {
    // Given: Regression report for passing run
    const SEED_RUN_ID_PASSING = 'seed-run-passing-004';
    await regressionPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_PASSING);

    // When: Export buttons are checked
    // Then: Export is still available (for audit/documentation purposes)
    await expect(regressionPage.exportJsonBtn).toBeVisible();
    await expect(regressionPage.exportHtmlBtn).toBeVisible();

    // Verify export works
    const downloadPromise = page.waitForEvent('download');
    await regressionPage.exportJsonBtn.click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/regression-report.*\.json$/);
  });
});
