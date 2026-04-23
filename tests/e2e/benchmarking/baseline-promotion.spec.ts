import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from '../helpers/auth';
import { RunDetailPage } from '../pages/RunDetailPage';
import { BaselineThresholdDialog } from '../pages/BaselineThresholdDialog';

/**
 * Test Plan: US-034 - Baseline Management - Promotion Scenarios
 * Tests promoting runs to baseline and editing thresholds
 */
test.describe.serial('Baseline Promotion', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  const SEED_PROJECT_ID = 'seed-project-invoice-extraction';
  const SEED_RUN_ID_COMPLETED = 'seed-run-completed-001'; // Baseline run
  const SEED_RUN_ID_PASSING = 'seed-run-passing-004'; // Non-baseline completed run
  const SEED_RUN_ID_REGRESSED = 'seed-run-regressed-005'; // Regressed run (non-baseline completed)
  const SEED_RUN_ID_FAILED = 'seed-run-failed-003'; // Failed run
  const SEED_RUN_ID_RUNNING = 'seed-run-running-002'; // Running run

  let runDetailPage: RunDetailPage;
  let thresholdDialog: BaselineThresholdDialog;

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
    thresholdDialog = new BaselineThresholdDialog(page);
  });

  // REQ US-034 Scenario 1: Promote Run to Baseline
  test('should promote non-baseline run to baseline with threshold configuration', async () => {
    // Given: Completed benchmark run with metrics (passing run)
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_PASSING);
    await expect(runDetailPage.runDefinitionName).toBeVisible();

    // Verify run is not currently baseline
    await expect(runDetailPage.baselineBadge).not.toBeVisible();
    await expect(runDetailPage.promoteBaselineBtn).toBeVisible();

    // When: User clicks "Promote to Baseline" button
    await runDetailPage.clickPromoteBaseline();

    // Then: Confirmation dialog appears
    await thresholdDialog.waitForDialog();

    // Verify existing baseline warning appears (completed run is already baseline)
    await expect(thresholdDialog.existingBaselineWarning).toBeVisible();
    await expect(thresholdDialog.existingBaselineWarning).toContainText('Existing baseline will be demoted');

    // Verify default thresholds are pre-filled
    const fieldAccuracyInput = thresholdDialog.getThresholdValueInput('field_accuracy');
    await expect(fieldAccuracyInput).toHaveValue('0.95');

    // Submit the promotion
    await thresholdDialog.clickSubmit();

    // Then: Dialog closes
    await thresholdDialog.waitForDialogClose();

    // Wait for page to refresh
    await runDetailPage.page.waitForLoadState('networkidle');

    // Verify baseline badge appears
    await expect(runDetailPage.baselineBadge).toBeVisible();
    await expect(runDetailPage.baselineBadge).toContainText('BASELINE');

    // Verify promote button is no longer visible (replaced with edit thresholds)
    await expect(runDetailPage.promoteBaselineBtn).not.toBeVisible();
    await expect(runDetailPage.editThresholdsBtn).toBeVisible();

    // Verify "Is Baseline" in run info table
    const isBaselineValue = runDetailPage.getIsBaselineValue();
    await expect(isBaselineValue).toContainText('Yes');
  });

  // REQ US-034 Scenario 2: Set Thresholds During Promotion
  test('should allow customizing thresholds per metric', async ({ page }) => {
    // Given: User is promoting a run to baseline (use regressed run since passing was promoted by previous test)
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);
    await runDetailPage.clickPromoteBaseline();
    await thresholdDialog.waitForDialog();

    // When: User customizes thresholds
    await thresholdDialog.setThreshold('field_accuracy', 'relative', 0.90);
    await thresholdDialog.setThreshold('character_accuracy', 'absolute', 0.95);
    await thresholdDialog.setThreshold('word_accuracy', 'relative', 0.93);

    // Then: Values are updated
    await expect(thresholdDialog.getThresholdValueInput('field_accuracy')).toHaveValue('0.9');
    await expect(thresholdDialog.getThresholdValueInput('character_accuracy')).toHaveValue('0.95');
    await expect(thresholdDialog.getThresholdValueInput('word_accuracy')).toHaveValue('0.93');

    // Verify submit button is enabled (user can proceed with custom values)
    await expect(thresholdDialog.submitBtn).toBeEnabled();

    // Cancel to avoid modifying database for other tests
    await thresholdDialog.clickCancel();
    await thresholdDialog.waitForDialogClose();
  });

  // REQ US-034 Scenario 7: Demote Previous Baseline
  test('should warn when promoting new baseline will demote existing baseline', async () => {
    // Given: Definition already has a baseline run (seed-run-completed-001)
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);

    // When: User opens the promote to baseline dialog
    await runDetailPage.clickPromoteBaseline();
    await thresholdDialog.waitForDialog();

    // Then: Warning appears about existing baseline
    await expect(thresholdDialog.existingBaselineWarning).toBeVisible();
    await expect(thresholdDialog.existingBaselineWarning).toContainText('Existing baseline will be demoted');
    await expect(thresholdDialog.existingBaselineWarning).toContainText('Baseline OCR Model');

    // User can still proceed
    await expect(thresholdDialog.submitBtn).toBeEnabled();

    // Cancel the dialog (don't actually promote)
    await thresholdDialog.clickCancel();
    await thresholdDialog.waitForDialogClose();
  });

  // REQ US-034 Scenario 10: Cannot Promote Failed Run
  test('should disable promote button for failed runs', async () => {
    // Given: Run with status "failed"
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_FAILED);
    await expect(runDetailPage.runDefinitionName).toBeVisible();

    // When: User views the run detail page
    // Then: "Promote to Baseline" button is disabled
    await expect(runDetailPage.promoteBaselineBtn).toBeVisible();
    await expect(runDetailPage.promoteBaselineBtn).toBeDisabled();

    // Tooltip explains why
    await runDetailPage.promoteBaselineBtn.hover();
    await expect(runDetailPage.promoteBaselineTooltip).toBeVisible();
    await expect(runDetailPage.promoteBaselineTooltip).toContainText('Only completed runs can be promoted to baseline');
  });

  // REQ US-034 Scenario 10: Cannot Promote Running Run
  test('should disable promote button for running runs', async () => {
    // Given: Run with status "running"
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_RUNNING);
    await expect(runDetailPage.runDefinitionName).toBeVisible();

    // When: User views the run detail page
    // Then: "Promote to Baseline" button is disabled
    await expect(runDetailPage.promoteBaselineBtn).toBeVisible();
    await expect(runDetailPage.promoteBaselineBtn).toBeDisabled();

    // Tooltip explains why
    await runDetailPage.promoteBaselineBtn.hover();
    await expect(runDetailPage.promoteBaselineTooltip).toBeVisible();
    await expect(runDetailPage.promoteBaselineTooltip).toContainText('Only completed runs can be promoted to baseline');
  });

  // REQ US-034 Scenario 11: Threshold Validation - Invalid Relative Threshold
  test('should validate relative thresholds are between 0 and 1', async () => {
    // Given: User is setting baseline thresholds
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);
    await runDetailPage.clickPromoteBaseline();
    await thresholdDialog.waitForDialog();

    // When: User enters invalid threshold (over 1 for relative)
    await thresholdDialog.setThreshold('field_accuracy', 'relative', 1.5);
    await thresholdDialog.clickSubmit();

    // Then: Validation error appears
    const errorMessage = thresholdDialog.page.locator('text=/Threshold must be between 0 and 1/');
    await expect(errorMessage).toBeVisible();

    // Form does not submit (dialog remains open)
    await expect(thresholdDialog.submitBtn).toBeVisible();
  });

  // REQ US-034 Scenario 11: Threshold Validation - Negative Threshold
  test('should validate thresholds are non-negative', async () => {
    // Given: User is setting baseline thresholds
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);
    await runDetailPage.clickPromoteBaseline();
    await thresholdDialog.waitForDialog();

    // When: User enters negative threshold
    await thresholdDialog.setThreshold('field_accuracy', 'absolute', -0.5);
    await thresholdDialog.clickSubmit();

    // Then: Validation error appears
    const errorMessage = thresholdDialog.page.locator('text=/must be non-negative/i');
    await expect(errorMessage).toBeVisible();

    // Form does not submit (dialog remains open)
    await expect(thresholdDialog.submitBtn).toBeVisible();
  });

  // REQ US-034 Scenario 12: Edit Baseline Thresholds
  test('should allow editing thresholds of existing baseline', async ({ page }) => {
    // Given: Baseline run exists with configured thresholds (initially SEED_RUN_ID_COMPLETED)
    // TODO: Use the initially seeded baseline run
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    // Wait for page to load and check if this run is baseline
    await runDetailPage.page.waitForLoadState('networkidle');

    // If this run was demoted by another test, skip (tests run in parallel)
    const isBaseline = await runDetailPage.baselineBadge.isVisible();
    if (!isBaseline) {
      // Try the passing run which might have been promoted
      await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_PASSING);
      await runDetailPage.page.waitForLoadState('networkidle');
    }

    await expect(runDetailPage.baselineBadge).toBeVisible();

    // When: User clicks "Edit Thresholds" action
    await expect(runDetailPage.editThresholdsBtn).toBeVisible();
    await runDetailPage.clickEditThresholds();

    // Then: Threshold configuration dialog opens with current values
    await thresholdDialog.waitForDialog();

    // Verify current values are pre-filled (0.95 from seed data)
    await expect(thresholdDialog.getThresholdValueInput('field_accuracy')).toHaveValue('0.95');
    await expect(thresholdDialog.getThresholdValueInput('character_accuracy')).toHaveValue('0.95');
    await expect(thresholdDialog.getThresholdValueInput('word_accuracy')).toHaveValue('0.95');

    // No existing baseline warning (editing, not promoting)
    await expect(thresholdDialog.existingBaselineWarning).not.toBeVisible();

    // User can modify thresholds
    await thresholdDialog.setThreshold('field_accuracy', 'relative', 0.92);

    // Saving updates the configuration
    await thresholdDialog.clickSubmit();
    await thresholdDialog.waitForDialogClose();
    await page.waitForLoadState('networkidle');

    // Verify still baseline
    await expect(runDetailPage.baselineBadge).toBeVisible();
  });

  // REQ US-034 Scenario 16: API Error Handling
  test('should handle API errors during promotion', async ({ page }) => {
    // TODO: Route interception not triggering error properly in test
    // TODO: Error handling is implemented in RunDetailPage with notifications.show()
    // Set up route interception BEFORE navigating
    await page.route(`**/api/benchmark/projects/${SEED_PROJECT_ID}/runs/${SEED_RUN_ID_REGRESSED}/baseline`, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Internal server error during baseline promotion',
          error: 'Internal Server Error',
          statusCode: 500,
        }),
      });
    });

    // Given: User attempts to promote a run to baseline
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_REGRESSED);
    await runDetailPage.clickPromoteBaseline();
    await thresholdDialog.waitForDialog();

    // When: API returns error (simulated)
    await thresholdDialog.clickSubmit();

    // Then: Error notification displays with message
    // Wait for any notification to appear (Mantine Notifications)
    const notification = page.locator('[class*="Notification"]').first();
    await expect(notification).toBeVisible({ timeout: 10000 });

    // Dialog remains open with user's threshold settings
    await expect(thresholdDialog.submitBtn).toBeVisible();

    // User can retry the action (remove the mock and allow it to succeed)
    await page.unroute(`**/api/benchmark/projects/${SEED_PROJECT_ID}/runs/${SEED_RUN_ID_REGRESSED}/baseline`);
    await thresholdDialog.clickSubmit();

    // Dialog closes after successful retry
    await thresholdDialog.waitForDialogClose();
  });
});
