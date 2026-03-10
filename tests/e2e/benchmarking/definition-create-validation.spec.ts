import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from '../helpers/auth';
import { ProjectDetailPage } from '../pages/ProjectDetailPage';
import { CreateDefinitionFormDialog } from '../pages/CreateDefinitionFormDialog';

// US-029: Benchmark Definition CRUD UI - Create and Validation Tests
// Scenarios: 9-11, 17 (Create success, validation, error handling)

test.describe('Definition Form - Create and Validation', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  const SEED_PROJECT_ID = 'seed-project-invoice-extraction';

  let projectPage: ProjectDetailPage;
  let formDialog: CreateDefinitionFormDialog;

  test.beforeAll(() => {
    if (!TEST_API_KEY) {
      throw new Error('TEST_API_KEY environment variable is not set');
    }
  });

  test.beforeEach(async ({ page }) => {
    // Setup authentication (both frontend and backend)
    await setupAuthenticatedTest(page, {
      apiKey: TEST_API_KEY!,
      backendUrl: BACKEND_URL,
      frontendUrl: FRONTEND_URL,
    });

    projectPage = new ProjectDetailPage(page);
    formDialog = new CreateDefinitionFormDialog(page);

    // Navigate to project detail page
    await projectPage.goto(SEED_PROJECT_ID);
  });

  // REQ US-029 Scenario 9: Create Definition Success
  test('should create definition successfully with valid data', async ({ page }) => {
    // Given: All required fields are filled with valid data
    await projectPage.clickCreateDefinition();
    await formDialog.waitForDialogToOpen();

    // When: User submits the form
    await formDialog.fillName('Test Definition - Happy Path');

    // Select dataset version
    await formDialog.datasetVersionSelect.click();
    await page.getByRole('option', { name: /v1\.0.*document/i }).click();

    // Wait for split to load
    await page.waitForTimeout(500);

    // Select split
    await formDialog.splitSelect.click();
    await page.getByRole('option', { name: /train/i }).click();

    // Select workflow
    await formDialog.workflowSelect.click();
    await page.getByRole('option', { name: /Standard OCR Workflow/i }).click();

    // Select evaluator type (should have default)
    // No need to select if default is already set

    // Fill evaluator config (valid JSON)
    await formDialog.fillEvaluatorConfig('{"metrics": ["accuracy"]}');

    // Submit the form and wait for both POST and GET requests
    const getRequestPromise = page.waitForResponse(
      response => response.url().includes(`/projects/${SEED_PROJECT_ID}/definitions`) && response.request().method() === 'GET',
      { timeout: 15000 }
    );

    await formDialog.clickCreateAndWaitForSubmit();

    // Wait for the refetch to complete
    await getRequestPromise;

    // Then: Success notification appears, form closes, definition list refreshes
    await page.waitForLoadState('networkidle');

    // Form should close (dialog title should disappear)
    await expect(formDialog.dialogTitle).not.toBeVisible();

    // New definition should appear in the list
    const newDefinitionRow = projectPage.getDefinitionRowByName('Test Definition - Happy Path');
    await expect(newDefinitionRow.first()).toBeVisible({ timeout: 10000 });
  });

  // REQ US-029 Scenario 10: Validation - Required Fields
  test('should show validation errors for required fields', async ({ page }) => {
    // Given: User attempts to create a definition
    await projectPage.clickCreateDefinition();
    await formDialog.waitForDialogToOpen();

    // When: User leaves required fields empty and submits
    await formDialog.clickCreate();

    // Then: Error messages appear on empty required fields
    // Name is required
    await expect(formDialog.nameError).toBeVisible();

    // Form does not submit (dialog still open)
    await expect(formDialog.dialogTitle).toBeVisible();
  });

  // REQ US-029 Scenario 11: Validation - Invalid JSON Config
  test('should show error for invalid JSON in evaluator config', async ({ page }) => {
    // Given: User is entering evaluator config
    await projectPage.clickCreateDefinition();
    await formDialog.waitForDialogToOpen();

    // Fill required fields first
    await formDialog.fillName('Test Definition - Invalid JSON');

    // Select dataset version
    await formDialog.datasetVersionSelect.click();
    await page.getByRole('option', { name: /v1\.0.*document/i }).click();
    await page.waitForTimeout(500);

    // Select split
    await formDialog.splitSelect.click();
    await page.getByRole('option', { name: /train/i }).click();

    // Select workflow
    await formDialog.workflowSelect.click();
    await page.getByRole('option', { name: /Standard OCR Workflow/i }).click();

    // When: User enters malformed JSON and submits
    await formDialog.fillEvaluatorConfig('{invalid json');
    await formDialog.clickCreate();

    // Then: JSON editor shows syntax error indicator
    // Error message: "Invalid JSON syntax"
    await expect(formDialog.jsonError).toBeVisible();

    // Form does not submit (dialog still open)
    await expect(formDialog.dialogTitle).toBeVisible();
  });

  // REQ US-029 Scenario 17: API Error Handling
  // TODO: Rewrite this test - current approach is flawed (navigating to non-existent project removes the button)
  // Better approach: trigger backend error during form submission and verify error handling
  test.skip('should handle API errors gracefully', async ({ page }) => {
    // Given: User attempts to create a definition
    await projectPage.clickCreateDefinition();
    await formDialog.waitForDialogToOpen();

    // Simulate an API error by using an invalid project ID
    // Navigate to a non-existent project
    await page.goto(`/benchmarking/projects/non-existent-project-id`);
    await page.waitForLoadState('networkidle');

    // Try to open create definition form
    await projectPage.clickCreateDefinition();
    await formDialog.waitForDialogToOpen();

    // When: User fills valid data and submits
    await formDialog.fillName('Test Definition - API Error');

    // This should fail because the project doesn't exist
    await formDialog.clickCreate();

    // Then: Error notification displays
    // Form remains open with user's data preserved
    // TODO: May need adjustment based on actual error handling implementation
    await page.waitForTimeout(1000);

    // Form should still be open
    await expect(formDialog.dialogTitle).toBeVisible();
  });
});
