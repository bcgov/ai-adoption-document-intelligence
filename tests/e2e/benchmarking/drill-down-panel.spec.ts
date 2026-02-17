import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from '../helpers/auth';
import { RunDrillDownPage } from '../pages/RunDrillDownPage';

test.describe('US-038: Slicing, Filtering & Drill-Down - Sample Detail Panel', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  const SEED_PROJECT_ID = 'seed-project-invoice-extraction';
  const SEED_RUN_ID = 'seed-run-completed-001';

  let drillDownPage: RunDrillDownPage;

  test.beforeAll(() => {
    if (!TEST_API_KEY) {
      throw new Error('TEST_API_KEY environment variable is not set');
    }
  });

  test.beforeEach(async ({ page }) => {
    // Setup authentication
    await setupAuthenticatedTest(page, {
      apiKey: TEST_API_KEY!,
      backendUrl: BACKEND_URL,
      frontendUrl: FRONTEND_URL,
    });

    drillDownPage = new RunDrillDownPage(page);
    await drillDownPage.goto(SEED_PROJECT_ID, SEED_RUN_ID);
  });

  // Scenario 8: Open Sample Drill-Down Panel
  test('should open sample detail drawer with complete information', async ({ page }) => {
    // REQ-038.8: Open drill-down panel for sample

    // Given: Filtered results view is displayed
    // (Already on drill-down page from beforeEach)

    // When: User clicks on a specific sample row
    const sampleId = 'sample-001';
    await drillDownPage.openSampleDetail(sampleId);

    // Then: Drill-down panel opens (side panel)
    await expect(drillDownPage.sampleDetailDrawer).toBeVisible();

    // And: Panel shows sample ID
    await expect(page.getByText(`Sample Details: ${sampleId}`)).toBeVisible();

    // And: Panel shows sample metadata (JSON format)
    await expect(page.getByText(/docType/i)).toBeVisible();
    await expect(page.getByText(/language/i)).toBeVisible();

    // And: Panel shows metrics table
    await expect(page.getByText(/field_accuracy/i)).toBeVisible();

    // Note: Ground truth, prediction, and evaluation details are shown when available
    // The seed data includes these in the perSampleResults structure
  });

  // Scenario 9: Field-by-Field Comparison View
  test('should show field-by-field comparison for schema-aware evaluation', async ({ page }) => {
    // REQ-038.9: Field comparison view
    // TODO: Field-by-field comparison requires schema-aware evaluation data
    // The current seed data doesn't include detailed field comparison data

    // Given: Drill-down panel for a sample is open (schema-aware evaluation)
    const sampleId = 'sample-001';
    await drillDownPage.openSampleDetail(sampleId);

    // When: Field comparison section is rendered
    // TODO: Add seed data with schema-aware evaluation results

    // Then: Table shows: Field Name, Predicted Value, Ground Truth Value, Match Status
    // And: Matched fields have green checkmark ✅
    // And: Mismatched fields have red X ❌ and are highlighted
    // And: Differences are visually distinct
    // And: User can see exactly which fields failed
  });

  // Scenario 10: Navigate Between Samples in Drill-Down
  test('should navigate between samples without closing panel', async ({ page }) => {
    // REQ-038.10: Navigate between samples in drill-down
    // TODO: Next/Previous navigation not yet implemented in drawer

    // Given: User is viewing a sample drill-down panel
    const firstSampleId = 'sample-001';
    await drillDownPage.openSampleDetail(firstSampleId);
    await expect(page.getByText(`Sample Details: ${firstSampleId}`)).toBeVisible();

    // When: User clicks "Next" navigation button
    // TODO: Implement when next/previous buttons are available
    // await page.getByRole('button', { name: /next/i }).click();

    // Then: Panel updates to show the next sample in the filtered list
    // await expect(page.getByText('Sample Details: sample-002')).toBeVisible();

    // And: User can browse through samples without closing the panel
    // await page.getByRole('button', { name: /previous/i }).click();
    // await expect(page.getByText(`Sample Details: ${firstSampleId}`)).toBeVisible();

    // And: Navigation wraps at the end/beginning (or disables buttons)
  });

  // Scenario 14: Input File Preview in Drill-Down
  test('should show input file preview', async ({ page }) => {
    // REQ-038.14: Input file preview in drill-down
    // TODO: Input file preview requires actual file storage/serving

    // Given: Sample has input image files
    const sampleId = 'sample-001';
    await drillDownPage.openSampleDetail(sampleId);

    // When: Drill-down panel is opened

    // Then: Image thumbnail or preview is displayed
    // TODO: Implement when file storage is set up
    // await expect(page.locator('img[alt*="preview"]')).toBeVisible();

    // And: User can click to view full-size image (lightbox or new tab)
    // And: For PDFs: first page thumbnail or PDF viewer
    // And: For other file types: file icon with download option
  });

  // Additional test: Close drill-down panel
  test('should close sample detail drawer', async ({ page }) => {
    // Given: Drill-down panel is open
    const sampleId = 'sample-001';
    await drillDownPage.openSampleDetail(sampleId);
    await expect(drillDownPage.sampleDetailDrawer).toBeVisible();

    // When: User clicks close button
    await drillDownPage.closeSampleDetail();

    // Then: Panel is closed
    await expect(drillDownPage.sampleDetailDrawer).not.toBeVisible();

    // And: User returns to filtered table view
    await expect(drillDownPage.samplesTable).toBeVisible();
  });

  // Additional test: Multiple samples can be opened sequentially
  test('should open different samples sequentially', async ({ page }) => {
    // Given: User is on drill-down page

    // When: User opens first sample
    await drillDownPage.openSampleDetail('sample-001');
    await expect(page.getByText('Sample Details: sample-001')).toBeVisible();

    // And: Closes it
    await drillDownPage.closeSampleDetail();

    // And: Opens a different sample
    await drillDownPage.openSampleDetail('sample-002');

    // Then: Second sample details are shown
    await expect(page.getByText('Sample Details: sample-002')).toBeVisible();
  });
});
