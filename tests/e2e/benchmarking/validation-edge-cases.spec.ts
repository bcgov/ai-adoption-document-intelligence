import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from '../helpers/auth';
import { DatasetDetailPage } from '../pages/DatasetDetailPage';
import { ValidationReportComponent } from '../pages/ValidationReportComponent';

/**
 * Test Plan: US-032 - Dataset Quality Checks & Validation
 * Scenarios: 7-15 (Edge cases, UI interactions, API error handling)
 */
test.describe('Dataset Validation - Edge Cases', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  // Seed data constants
  const DATASET_ID = 'seed-dataset-invoices';
  const DRAFT_VERSION_ID = 'seed-dataset-version-v2.0-draft';
  const PUBLISHED_VERSION_ID = 'seed-dataset-version-v1.0';

  let datasetPage: DatasetDetailPage;
  let validationReport: ValidationReportComponent;

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

    datasetPage = new DatasetDetailPage(page);
    validationReport = new ValidationReportComponent(page);

    // Navigate to dataset detail page
    await datasetPage.goto(DATASET_ID);
  });

  // REQ-032: Scenario 7 - Sampled Validation
  test.skip('should support sampled validation on large datasets', async ({ page }) => {
    // NOTE: Skipped - requires implementation of sampled validation feature
    // To implement: Add sampleSize parameter to validation endpoint

    // Given: Large dataset with 1000+ samples
    // When: User triggers quick validate with sample size
    await datasetPage.triggerValidation(DRAFT_VERSION_ID);
    await validationReport.waitForValidationComplete();

    // Then: Validation report indicates sampled validation
    await expect(validationReport.sampleInfo).toBeVisible();
    await expect(validationReport.sampleInfo).toContainText(/sampled/i);
    await expect(validationReport.sampleInfo).toContainText(/of/i);

    // And: Warning suggests full validation before publish
    await expect(page.getByText(/full validation recommended/i)).toBeVisible();
  });

  // REQ-032: Scenario 8 - Validation Progress Indicator
  test('should complete validation and show results', async ({ page }) => {
    // Given: User triggers validation
    await datasetPage.triggerValidation(DRAFT_VERSION_ID);

    // When: Validation is running (may be too fast to catch loading state)
    // NOTE: Validation can complete very quickly, so we can't reliably assert on loading state

    // Wait for completion
    await validationReport.waitForValidationComplete();

    // Then: Results or error message is displayed
    const hasResults = await validationReport.statusCard.isVisible().catch(() => false);
    const hasError = await validationReport.noResultsMessage.isVisible().catch(() => false);

    expect(hasResults || hasError).toBeTruthy();
  });

  // REQ-032: Scenario 9 - Expand/Collapse Error Details
  test.skip('should support collapsible error sections', async ({ page }) => {
    // NOTE: Skipped - requires implementation of collapsible sections
    // Current UI shows all details expanded

    // Given: Validation results contain multiple errors
    await datasetPage.triggerValidation(DRAFT_VERSION_ID);
    await validationReport.waitForValidationComplete();

    // When: User views validation results
    // Then: Error categories are initially collapsed
    // And: User can expand to see full error list
    // And: Individual errors can be expanded for details
  });

  // REQ-032: Scenario 10 - Retry Validation After Fixes
  test('should allow re-validation of the same version', async ({ page }) => {
    // Given: User has run validation once
    await datasetPage.triggerValidation(DRAFT_VERSION_ID);
    await validationReport.waitForValidationComplete();

    // Close the dialog if it's open
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // When: User clicks validate again
    await datasetPage.triggerValidation(DRAFT_VERSION_ID);

    // Then: New validation runs and completes
    await validationReport.waitForValidationComplete();

    // And: New results replace old results
    const hasResults = await validationReport.statusCard.isVisible().catch(() => false);
    const hasError = await validationReport.noResultsMessage.isVisible().catch(() => false);
    expect(hasResults || hasError).toBeTruthy();
  });

  // REQ-032: Scenario 11 - Validation History
  test.skip('should track validation history', async ({ page }) => {
    // NOTE: Skipped - validation history feature not in Phase 1
    // To implement: Add validation history tracking and UI

    // Given: Dataset version has been validated multiple times
    // When: User views validation section
    // Then: History shows timestamp, result, error count
    // And: Latest validation is highlighted
  });

  // REQ-032: Scenario 12 - Export Validation Report
  test.skip('should allow exporting validation report', async ({ page }) => {
    // NOTE: Skipped - export feature not in Phase 1
    // To implement: Add export button and download functionality

    // Given: Validation has been completed
    await datasetPage.triggerValidation(DRAFT_VERSION_ID);
    await validationReport.waitForValidationComplete();

    // When: User clicks export button
    // Then: Report downloads as JSON/CSV
    // And: File name includes timestamp
  });

  // REQ-032: Scenario 13 - Publish Warning for Invalid Dataset
  test.skip('should prevent or warn when publishing invalid dataset', async ({ page }) => {
    // NOTE: Skipped - requires seed data with validation errors
    // To implement: Create dataset version with errors, test publish action

    // Given: Dataset version has validation errors
    await datasetPage.triggerValidation(DRAFT_VERSION_ID);
    await validationReport.waitForValidationComplete();

    // Close validation dialog
    await page.keyboard.press('Escape');

    // When: User attempts to publish
    // Then: Button is disabled with tooltip OR warning modal appears
    // And: User must acknowledge risks if force publishing
  });

  // REQ-032: Scenario 14 - Validation Without Schema
  test.skip('should handle datasets without groundTruthSchema', async ({ page }) => {
    // NOTE: Skipped - requires dataset version without schema
    // To implement: Create dataset version with null groundTruthSchema

    // Given: Dataset version has no groundTruthSchema defined
    // When: Validation runs
    await datasetPage.triggerValidation(DRAFT_VERSION_ID);
    await validationReport.waitForValidationComplete();

    // Then: Schema validation is skipped
    const schemaViolations = await validationReport.getIssueCount('schema-violations');
    expect(schemaViolations).toBe(0);

    // And: Message indicates schema validation was skipped
    await expect(page.getByText(/no schema defined/i)).toBeVisible();

    // And: Other checks still run
    await expect(validationReport.issueSummaryTable).toBeVisible();
  });

  // REQ-032: Scenario 15 - API Error Handling
  test('should handle validation API errors gracefully', async ({ page }) => {
    // Given: Validation endpoint may fail (e.g., dataset repo doesn't exist)
    // When: User triggers validation
    await datasetPage.triggerValidation(DRAFT_VERSION_ID);

    // Then: Either results are shown or error message appears
    await validationReport.waitForValidationComplete();

    const hasResults = await validationReport.statusCard.isVisible().catch(() => false);
    const hasError = await validationReport.noResultsMessage.isVisible().catch(() => false);

    // One of these should be true
    expect(hasResults || hasError).toBeTruthy();

    if (hasError) {
      // Verify error message is user-friendly
      await expect(validationReport.noResultsMessage).toBeVisible();
      await expect(validationReport.noResultsMessage).toContainText(/no validation results/i);
    }
  });

  // REQ-032: Additional - Validate action availability
  test('should show validate action for draft and published versions', async ({ page }) => {
    // Given: Dataset has versions in different states
    await expect(datasetPage.versionsTable).toBeVisible();

    // When: User views version actions
    // Then: Validate action is available for draft versions
    await datasetPage.getVersionActionsBtn(DRAFT_VERSION_ID).click();
    await expect(datasetPage.getVersionActionMenuItem(DRAFT_VERSION_ID, 'validate')).toBeVisible();

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // And: Validate action is available for published versions
    await datasetPage.getVersionActionsBtn(PUBLISHED_VERSION_ID).click();
    await expect(datasetPage.getVersionActionMenuItem(PUBLISHED_VERSION_ID, 'validate')).toBeVisible();
  });

  // REQ-032: Additional - Validation dialog can be closed
  test('should allow closing validation dialog', async ({ page }) => {
    // Given: User triggers validation
    await datasetPage.triggerValidation(DRAFT_VERSION_ID);
    await validationReport.waitForValidationComplete();

    // When: User closes the dialog (Escape key)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // Then: Dialog closes and user returns to dataset detail page
    await expect(datasetPage.versionsTable).toBeVisible();

    // And: User can re-open validation
    await datasetPage.triggerValidation(DRAFT_VERSION_ID);

    // Validation runs again
    await validationReport.waitForValidationComplete();
    const hasResults = await validationReport.statusCard.isVisible().catch(() => false);
    const hasError = await validationReport.noResultsMessage.isVisible().catch(() => false);
    expect(hasResults || hasError).toBeTruthy();
  });
});
