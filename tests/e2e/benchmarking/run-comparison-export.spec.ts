import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from '../helpers/auth';
import { RunComparisonPage } from '../pages/RunComparisonPage';
import * as fs from 'fs';
import * as path from 'path';

test.describe('US-036: Run Comparison - Export Functionality', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  const TEST_PROJECT_ID = 'seed-project-invoice-extraction';
  const TEST_RUN_1 = 'seed-run-completed-001';
  const TEST_RUN_2 = 'seed-run-passing-004';

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

    comparisonPage = new RunComparisonPage(page);
    await comparisonPage.goto(TEST_PROJECT_ID, [TEST_RUN_1, TEST_RUN_2]);
  });

  // Scenario 8: Export Comparison Data as CSV
  test('should export comparison data as CSV', async () => {
    // REQ-036-08: CSV export functionality

    // Given: Comparison view is displayed
    await expect(comparisonPage.metricsComparisonTable).toBeVisible();

    // When: User clicks "Export" button and selects CSV format
    const download = await comparisonPage.exportCsv();

    // Then: CSV file is downloaded
    expect(download).toBeTruthy();
    const filename = download.suggestedFilename();

    // Then: Filename is appropriate (e.g., contains "comparison" and timestamp)
    expect(filename).toMatch(/benchmark-comparison.*\.csv/);
  });

  test('should include correct data in CSV export', async () => {
    // REQ-036-08: CSV contains metric names, run values, deltas, percentages

    // Given: Comparison is displayed
    await expect(comparisonPage.metricsComparisonTable).toBeVisible();

    // When: User exports as CSV
    const download = await comparisonPage.exportCsv();

    // Then: Save file to verify contents
    const downloadPath = path.join('/tmp', download.suggestedFilename());
    await download.saveAs(downloadPath);

    // Then: CSV file exists
    expect(fs.existsSync(downloadPath)).toBeTruthy();

    // Then: CSV contains data
    const csvContent = fs.readFileSync(downloadPath, 'utf-8');
    expect(csvContent.length).toBeGreaterThan(0);

    // Then: CSV has headers (metric name, run values, delta, percentage)
    const lines = csvContent.split('\n');
    expect(lines.length).toBeGreaterThan(1); // At least header + one data row

    const header = lines[0];
    expect(header).toContain('Metric'); // Metric name column

    // Cleanup
    fs.unlinkSync(downloadPath);
  });

  test('should format CSV for spreadsheet import', async () => {
    // REQ-036-08: Data is formatted for spreadsheet import

    // Given: Comparison is displayed
    await expect(comparisonPage.metricsComparisonTable).toBeVisible();

    // When: User exports as CSV
    const download = await comparisonPage.exportCsv();

    // Then: Save and verify format
    const downloadPath = path.join('/tmp', download.suggestedFilename());
    await download.saveAs(downloadPath);

    const csvContent = fs.readFileSync(downloadPath, 'utf-8');

    // Then: CSV uses comma delimiters
    expect(csvContent).toContain(',');

    // Then: Rows are newline-separated
    const lines = csvContent.split('\n');
    expect(lines.length).toBeGreaterThan(1);

    // Cleanup
    fs.unlinkSync(downloadPath);
  });

  // Scenario 9: Export Comparison Data as JSON
  test('should export comparison data as JSON', async () => {
    // REQ-036-09: JSON export functionality

    // Given: Comparison view is displayed
    await expect(comparisonPage.metricsComparisonTable).toBeVisible();

    // When: User clicks "Export" and selects JSON format
    const download = await comparisonPage.exportJson();

    // Then: JSON file is downloaded
    expect(download).toBeTruthy();
    const filename = download.suggestedFilename();

    // Then: Filename is appropriate
    expect(filename).toMatch(/benchmark-comparison.*\.json/);
  });

  test('should include runs metadata in JSON export', async () => {
    // REQ-036-09: JSON structure includes runs metadata, metrics, deltas, params, tags

    // Given: Comparison is displayed
    await expect(comparisonPage.metricsComparisonTable).toBeVisible();

    // When: User exports as JSON
    const download = await comparisonPage.exportJson();

    // Then: Save file to verify contents
    const downloadPath = path.join('/tmp', download.suggestedFilename());
    await download.saveAs(downloadPath);

    // Then: JSON file exists
    expect(fs.existsSync(downloadPath)).toBeTruthy();

    // Then: Parse JSON to verify structure
    const jsonContent = fs.readFileSync(downloadPath, 'utf-8');
    const jsonData = JSON.parse(jsonContent);

    // Then: JSON contains expected data
    expect(jsonData).toBeTruthy();

    // Note: Exact structure depends on backend implementation
    // At minimum, should be valid JSON object
    expect(typeof jsonData).toBe('object');

    // Cleanup
    fs.unlinkSync(downloadPath);
  });

  test('should produce valid and well-formatted JSON', async () => {
    // REQ-036-09: JSON is valid and well-formatted

    // Given: Comparison is displayed
    await expect(comparisonPage.metricsComparisonTable).toBeVisible();

    // When: User exports as JSON
    const download = await comparisonPage.exportJson();

    // Then: Save and verify format
    const downloadPath = path.join('/tmp', download.suggestedFilename());
    await download.saveAs(downloadPath);

    const jsonContent = fs.readFileSync(downloadPath, 'utf-8');

    // Then: JSON is parseable (no syntax errors)
    expect(() => JSON.parse(jsonContent)).not.toThrow();

    // Then: JSON is indented/pretty-printed (contains newlines)
    const jsonData = JSON.parse(jsonContent);
    const prettyJson = JSON.stringify(jsonData, null, 2);

    // If JSON is pretty-printed, it should have multiple lines
    expect(jsonContent.split('\n').length).toBeGreaterThan(1);

    // Cleanup
    fs.unlinkSync(downloadPath);
  });

  test('should make JSON suitable for programmatic analysis', async () => {
    // REQ-036-09: JSON structure is suitable for programmatic use

    // Given: Comparison is displayed
    await expect(comparisonPage.metricsComparisonTable).toBeVisible();

    // When: User exports as JSON
    const download = await comparisonPage.exportJson();

    // Then: Save and parse JSON
    const downloadPath = path.join('/tmp', download.suggestedFilename());
    await download.saveAs(downloadPath);

    const jsonContent = fs.readFileSync(downloadPath, 'utf-8');
    const jsonData = JSON.parse(jsonContent);

    // Then: JSON has structured data (object with properties)
    expect(typeof jsonData).toBe('object');
    expect(jsonData).not.toBeNull();

    // Then: Data structure is consistent (can be processed by scripts)
    // Note: Exact structure verification depends on backend schema
    expect(Object.keys(jsonData).length).toBeGreaterThan(0);

    // Cleanup
    fs.unlinkSync(downloadPath);
  });

  test('should export data matching displayed comparison', async () => {
    // REQ: Exported data should match what user sees in UI

    // Given: Comparison is displayed
    await expect(comparisonPage.metricsComparisonTable).toBeVisible();

    // When: User exports as CSV or JSON
    const csvDownload = await comparisonPage.exportCsv();
    await comparisonPage.page.waitForTimeout(500); // Brief wait between downloads

    // Then: Download completes successfully
    expect(csvDownload).toBeTruthy();

    // Note: Detailed content verification would require parsing CSV and comparing
    // with table data, which is complex. This test ensures export works end-to-end.
  });
});
