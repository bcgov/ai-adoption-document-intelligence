import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from '../helpers/auth';
import { DatasetDetailPage } from '../pages/DatasetDetailPage';
import { ValidationReportComponent } from '../pages/ValidationReportComponent';

/**
 * Test Plan: US-032 - Dataset Quality Checks & Validation
 * Scenarios: 3, 4, 5, 6 (Error cases - schema violations, missing ground truth, duplicates, corruption)
 */
test.describe('Dataset Validation - Error Detection', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  // Seed data constants
  const DATASET_ID = 'seed-dataset-invoices';
  const DRAFT_VERSION_ID = 'seed-dataset-version-v2.0-draft';

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

  // REQ-032: Scenario 3 - Schema Violations Detection
  test('should display schema violation details when detected', async ({ page }) => {
    // TODO: requires seed data with schema violations
    // To implement: Create a dataset version with ground truth that violates the schema

    // Given: Dataset version with schema violations
    // When: User validates the version
    await datasetPage.triggerValidation(DRAFT_VERSION_ID);
    await validationReport.waitForValidationComplete();

    // Then: Status shows invalid
    await expect(validationReport.statusBadge).toContainText(/invalid/i);

    // And: Schema violations count > 0
    const schemaViolations = await validationReport.getIssueCount('schema-violations');
    expect(schemaViolations).toBeGreaterThan(0);

    // And: Detailed issues show schema violation category
    const firstIssue = validationReport.getIssueCard(0);
    await expect(firstIssue).toBeVisible();
    await expect(validationReport.getIssueCategory(0)).toContainText(/schema violation/i);

    // And: Issue includes sample ID, error message, and details
    await expect(validationReport.getIssueSampleId(0)).toBeVisible();
    await expect(validationReport.getIssueMessage(0)).toBeVisible();
    await expect(validationReport.getIssueSeverity(0)).toContainText(/error/i);
  });

  // REQ-032: Scenario 4 - Missing Ground Truth Detection
  test('should detect samples without ground truth files', async ({ page }) => {
    // TODO: requires seed data with missing ground truth
    // To implement: Create a dataset version with samples missing ground truth

    // Given: Dataset version with missing ground truth
    // When: Validation runs
    await datasetPage.triggerValidation(DRAFT_VERSION_ID);
    await validationReport.waitForValidationComplete();

    // Then: Missing ground truth count > 0
    const missingGroundTruth = await validationReport.getIssueCount('missing-ground-truth');
    expect(missingGroundTruth).toBeGreaterThan(0);

    // And: Detailed issues list affected sample IDs
    await expect(validationReport.detailedIssuesCard).toBeVisible();
    const issuesWithMissingGT = page.locator(
      '[data-testid^="issue-category-"]:has-text("Missing Ground Truth")'
    );
    await expect(issuesWithMissingGT.first()).toBeVisible();

    // And: Overall validation shows warning or failure
    const statusText = await validationReport.statusBadge.textContent();
    expect(statusText?.toLowerCase()).toMatch(/invalid|warning/);
  });

  // REQ-032: Scenario 5 - Duplicate Detection
  test('should identify duplicate samples', async ({ page }) => {
    // TODO: requires seed data with duplicate samples
    // To implement: Create a dataset version with duplicate samples (by content hash or metadata)

    // Given: Dataset version with duplicate samples
    // When: Validation detects duplicates
    await datasetPage.triggerValidation(DRAFT_VERSION_ID);
    await validationReport.waitForValidationComplete();

    // Then: Duplicates count > 0
    const duplicates = await validationReport.getIssueCount('duplicates');
    expect(duplicates).toBeGreaterThan(0);

    // And: Duplicate issues show warning severity (not blocking)
    const duplicateIssues = page.locator(
      '[data-testid^="issue-category-"]:has-text("Duplicate")'
    );
    if (await duplicateIssues.count() > 0) {
      const firstDuplicateIndex = 0; // Adjust based on actual issue order
      await expect(validationReport.getIssueSeverity(firstDuplicateIndex)).toContainText(/warning/i);
    }

    // And: Duplicate groups list affected sample IDs
    await expect(validationReport.detailedIssuesCard).toBeVisible();
  });

  // REQ-032: Scenario 6 - Corruption Check Results
  test('should detect corrupted files', async ({ page }) => {
    // TODO: requires seed data with corrupted files
    // To implement: Create a dataset version with corrupted/unreadable files

    // Given: Dataset version with corrupted files
    // When: Validation runs corruption checks
    await datasetPage.triggerValidation(DRAFT_VERSION_ID);
    await validationReport.waitForValidationComplete();

    // Then: Corruption count > 0
    const corruption = await validationReport.getIssueCount('corruption');
    expect(corruption).toBeGreaterThan(0);

    // And: Status shows invalid (corruption is blocking)
    await expect(validationReport.statusBadge).toContainText(/invalid/i);

    // And: Corruption issues show error severity
    const corruptionIssues = page.locator(
      '[data-testid^="issue-category-"]:has-text("Corruption")'
    );
    if (await corruptionIssues.count() > 0) {
      const firstCorruptionIndex = 0;
      await expect(validationReport.getIssueSeverity(firstCorruptionIndex)).toContainText(/error/i);
    }

    // And: Issues include file path and corruption type
    const firstIssue = validationReport.getIssueCard(0);
    await expect(firstIssue).toBeVisible();
    await expect(validationReport.getIssueFilePath(0)).toBeVisible();
    await expect(validationReport.getIssueMessage(0)).toBeVisible();
  });

  // REQ-032: Scenario 3 - Multiple error types in one validation
  test('should display all error categories when multiple issues exist', async ({ page }) => {
    // TODO: requires seed data with multiple error types
    // To implement: Create a dataset version with schema violations, missing ground truth, and corruption

    // Given: Dataset version with multiple types of issues
    // When: Validation completes
    await datasetPage.triggerValidation(DRAFT_VERSION_ID);
    await validationReport.waitForValidationComplete();

    // Then: Multiple issue categories show non-zero counts
    const schemaViolations = await validationReport.getIssueCount('schema-violations');
    const missingGT = await validationReport.getIssueCount('missing-ground-truth');
    const duplicates = await validationReport.getIssueCount('duplicates');
    const corruption = await validationReport.getIssueCount('corruption');
    const total = await validationReport.getIssueCount('total');

    // At least some issues should be present
    expect(total).toBeGreaterThan(0);

    // Total should equal sum of all categories
    expect(total).toBe(schemaViolations + missingGT + duplicates + corruption);

    // And: Detailed issues list includes all error types
    const detailedCount = await validationReport.getDetailedIssueCount();
    expect(detailedCount).toBe(total);
  });
});
