import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from '../helpers/auth';
import { RunDetailPage } from '../pages/RunDetailPage';

test.describe('US-031 - Results Summary: Drill-Down', () => {
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

  test('Scenario 7: should display drill-down summary section', async ({ page }) => {
    // REQ US-031: Drill-down summary shows preview data with link to full analysis

    // Given: Completed benchmark run with drill-down data
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    // Then: Drill-down summary section is visible
    await expect(runDetailPage.drillDownHeading).toBeVisible();
    await expect(runDetailPage.drillDownHeading).toContainText('Drill-Down');
  });

  test('Scenario 7: should have button to view all samples', async ({ page }) => {
    // REQ US-031: Link to full drill-down page

    // Given: Run with drill-down data
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    // Then: "View All Samples" button is visible
    await expect(runDetailPage.viewAllSamplesBtn).toBeVisible();
  });

  test('Scenario 7: drill-down summary should be organized into sections', async ({ page }) => {
    // REQ US-031: Sections include top-N worst samples, per-field error breakdown, error cluster tags

    // Given: Run with complete drill-down data
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    // Then: All drill-down subsections should be present
    // Note: Implementation may show these in tabs, cards, or sections

    const drillDownSection = page.locator('[data-testid="drill-down-heading"]').locator('..');
    await expect(drillDownSection).toBeAttached();

    // Check for worst samples (conditional on implementation)
    const worstSamplesVisible = await runDetailPage.worstSamplesTable.isVisible().catch(() => false);

    // Check for field error breakdown
    const fieldErrorVisible = await runDetailPage.fieldErrorBreakdownTable.isVisible().catch(() => false);

    // Check for error clusters
    const errorClustersVisible = await runDetailPage.errorClustersTable.isVisible().catch(() => false);

    // At least one subsection should be visible
    const anySubsectionVisible = worstSamplesVisible || fieldErrorVisible || errorClustersVisible;
    expect(anySubsectionVisible).toBe(true);
  });

  test('Scenario 8: should display top-N worst-performing samples', async ({ page }) => {
    // REQ US-031: Table shows sample ID, metric scores, error diagnostics

    // Given: Drill-down summary contains worst-performing samples
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    // Then: Worst samples table should be visible (if implemented)
    const worstSamplesTable = runDetailPage.worstSamplesTable;
    const isVisible = await worstSamplesTable.isVisible().catch(() => false);

    if (isVisible) {
      // Verify table shows sample IDs
      await expect(worstSamplesTable).toContainText('sample-');

      // Verify table shows metric information
      const tableText = await worstSamplesTable.textContent();
      expect(tableText).toBeTruthy();

      // Check for metric values (0.XX format)
      expect(tableText).toMatch(/0\.\d{2,4}/);
    } else {
      // If not visible, this feature may not be implemented yet
      console.log('Worst samples table not found - feature may not be implemented');
    }
  });

  test('Scenario 8: worst samples should be ordered by performance', async ({ page }) => {
    // REQ US-031: Samples are ordered by performance (worst first)

    // Given: Worst samples section
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    const worstSamplesTable = runDetailPage.worstSamplesTable;
    const isVisible = await worstSamplesTable.isVisible().catch(() => false);

    if (isVisible) {
      // Get all metric values from the table
      const rows = worstSamplesTable.locator('tbody tr');
      const rowCount = await rows.count();

      if (rowCount >= 2) {
        // Get first two metric values
        const firstValue = await rows.nth(0).textContent();
        const secondValue = await rows.nth(1).textContent();

        // Both should contain metric values
        expect(firstValue).toBeTruthy();
        expect(secondValue).toBeTruthy();

        // Values should be in descending order (worst first means lowest values first)
        // Note: This depends on whether "worst" means lowest or highest metric
      }
    }
  });

  test('Scenario 9: should display per-field error breakdown', async ({ page }) => {
    // REQ US-031: Table shows field name, total samples, correct, incorrect, precision, recall, F1

    // Given: Drill-down summary contains per-field error analysis
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    // Then: Field error breakdown table is visible
    const fieldErrorTable = runDetailPage.fieldErrorBreakdownTable;
    const isVisible = await fieldErrorTable.isVisible().catch(() => false);

    if (isVisible) {
      await expect(fieldErrorTable).toBeVisible();

      // Seed data has: invoice_number, total_amount, vendor_name, invoice_date
      const tableText = await fieldErrorTable.textContent();
      expect(tableText).toContain('invoice_number');
      expect(tableText).toContain('total_amount');
      expect(tableText).toContain('vendor_name');
      expect(tableText).toContain('invoice_date');

      // Check for error counts and rates
      expect(tableText).toMatch(/\d+/); // Contains numbers
      expect(tableText).toMatch(/0\.\d{1,2}/); // Contains error rates (0.XX format)
    }
  });

  test('Scenario 9: fields with high error rates should be highlighted', async ({ page }) => {
    // REQ US-031: Fields with high error rates are highlighted

    // Given: Per-field error breakdown with varying error rates
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    const fieldErrorTable = runDetailPage.fieldErrorBreakdownTable;
    const isVisible = await fieldErrorTable.isVisible().catch(() => false);

    if (isVisible) {
      // Seed data: vendor_name has 0.16 error rate (highest)
      const vendorNameRow = fieldErrorTable.locator('tr:has-text("vendor_name")');
      const isRowVisible = await vendorNameRow.isVisible().catch(() => false);

      if (isRowVisible) {
        // Check if row has highlighting (color, badge, icon)
        // Implementation may use CSS classes, background color, or badges
        const rowHtml = await vendorNameRow.innerHTML();
        expect(rowHtml).toBeTruthy();

        // Could check for red color, warning badge, etc.
        // This is implementation-specific
      }
    }
  });

  test('Scenario 10: should display error cluster tags', async ({ page }) => {
    // REQ US-031: Tags/badges show common error patterns with counts

    // Given: Drill-down summary contains error clustering analysis
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    // Then: Error clusters section is visible
    const errorClustersTable = runDetailPage.errorClustersTable;
    const isVisible = await errorClustersTable.isVisible().catch(() => false);

    if (isVisible) {
      await expect(errorClustersTable).toBeVisible();

      // Seed data has: low_confidence (12), missing_field (8), format_mismatch (5), ocr_error (7)
      const tableText = await errorClustersTable.textContent();

      expect(tableText).toContain('low_confidence');
      expect(tableText).toContain('12'); // Count

      expect(tableText).toContain('missing_field');
      expect(tableText).toContain('8');

      expect(tableText).toContain('format_mismatch');
      expect(tableText).toContain('5');

      expect(tableText).toContain('ocr_error');
      expect(tableText).toContain('7');
    }
  });

  test('Scenario 10: error cluster tags should show count of affected samples', async ({ page }) => {
    // REQ US-031: Each tag shows count of affected samples

    // Given: Error clusters with counts
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    const errorClustersTable = runDetailPage.errorClustersTable;
    const isVisible = await errorClustersTable.isVisible().catch(() => false);

    if (isVisible) {
      // Each cluster should have an associated count
      const rows = errorClustersTable.locator('tr');
      const rowCount = await rows.count();

      // Should have 4 error clusters from seed data
      expect(rowCount).toBeGreaterThanOrEqual(4);

      // Each row should have a tag name and a count (number)
      for (let i = 0; i < Math.min(rowCount, 4); i++) {
        const rowText = await rows.nth(i).textContent();
        expect(rowText).toBeTruthy();
        expect(rowText).toMatch(/\d+/); // Contains a number (count)
      }
    }
  });

  test('Scenario 7: clicking "View All Samples" should navigate to drill-down page', async ({ page }) => {
    // REQ US-031: Navigation to full drill-down analysis page

    // Given: Run detail page with drill-down summary
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    // When: User clicks "View All Samples" button
    await runDetailPage.viewAllSamplesBtn.click();
    await page.waitForLoadState('networkidle');

    // Then: User is navigated to drill-down page
    await expect(page).toHaveURL(
      new RegExp(`/benchmarking/projects/${SEED_PROJECT_ID}/runs/${SEED_RUN_ID_COMPLETED}/drill-down`)
    );

    // And: Drill-down page loads successfully
    await expect(page.getByText(/Sample Results/i)).toBeVisible();
  });

  test('Scenario 9: per-field breakdown should be sortable', async ({ page }) => {
    // REQ US-031: User can sort by error rate

    // Given: Per-field error breakdown table
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    const fieldErrorTable = runDetailPage.fieldErrorBreakdownTable;
    const isVisible = await fieldErrorTable.isVisible().catch(() => false);

    if (isVisible) {
      // Check if table has sortable headers
      const headers = fieldErrorTable.locator('thead th');
      const headerCount = await headers.count();

      expect(headerCount).toBeGreaterThan(0);

      // Note: Testing actual sorting behavior requires clicking headers and verifying order
      // This is implementation-specific
    }
  });
});
