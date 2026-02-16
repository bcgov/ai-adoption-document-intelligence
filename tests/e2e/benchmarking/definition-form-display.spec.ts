import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from '../helpers/auth';
import { ProjectDetailPage } from '../pages/ProjectDetailPage';
import { CreateDefinitionFormDialog } from '../pages/CreateDefinitionFormDialog';

// US-029: Benchmark Definition CRUD UI - Form Display Tests
// Scenarios: 1-8 (Form fields, dropdowns, runtime settings, artifact policy)

test.describe('Definition Form - Display and Fields', () => {
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

  // REQ US-029 Scenario 1: Open Create Definition Form
  test('should open create definition form with all required fields', async ({ page }) => {
    // Given: User is on a project detail page
    await expect(projectPage.projectNameTitle).toBeVisible();

    // When: User clicks "Create Definition" button
    await projectPage.clickCreateDefinition();

    // Then: Form dialog opens with all required fields
    await formDialog.waitForDialogToOpen();
    await expect(formDialog.dialogTitle).toBeVisible();
    await expect(formDialog.nameInput).toBeVisible();
    await expect(formDialog.datasetVersionSelect).toBeVisible();
    await expect(formDialog.splitSelect).toBeVisible();
    await expect(formDialog.workflowSelect).toBeVisible();
    await expect(formDialog.evaluatorTypeSelect).toBeVisible();
    await expect(formDialog.evaluatorConfigTextarea).toBeVisible();
    await expect(formDialog.maxParallelDocsInput).toBeVisible();
    await expect(formDialog.perDocTimeoutInput).toBeVisible();
    await expect(formDialog.productionQueueNo).toBeVisible();
    await expect(formDialog.productionQueueYes).toBeVisible();
    await expect(formDialog.artifactPolicyFull).toBeVisible();
    await expect(formDialog.artifactPolicyFailures).toBeVisible();
    await expect(formDialog.artifactPolicySampled).toBeVisible();
    await expect(formDialog.cancelBtn).toBeVisible();
    await expect(formDialog.createBtn).toBeVisible();
  });

  // REQ US-029 Scenario 2: Dataset Version Dropdown Loads
  test('should populate dataset version dropdown with published and draft versions', async ({ page }) => {
    // Given: Published dataset versions exist in the system
    await projectPage.goto(SEED_PROJECT_ID);

    // When: User opens the dataset version dropdown
    await projectPage.clickCreateDefinition();
    await formDialog.waitForDialogToOpen();
    await formDialog.datasetVersionSelect.click();

    // Then: Published versions are listed with format and draft versions shown with indicator
    // Looking for v1.0 (published) and v2.0-draft versions from seed data
    const v10Option = page.getByText(/v1\.0.*\d+ document/i);
    const v20DraftOption = page.getByText(/v2\.0-draft.*\d+ document/i);

    await expect(v10Option.first()).toBeVisible();
    await expect(v20DraftOption.first()).toBeVisible();

    // Draft version should have DRAFT indicator
    await expect(page.getByText(/DRAFT/i).first()).toBeVisible();
  });

  // REQ US-029 Scenario 3: Split Dropdown Filters by Version
  test('should filter splits by selected dataset version', async ({ page }) => {
    // Given: User has selected a dataset version
    await projectPage.goto(SEED_PROJECT_ID);
    await projectPage.clickCreateDefinition();
    await formDialog.waitForDialogToOpen();

    // When: User selects a dataset version
    await formDialog.datasetVersionSelect.click();

    // Use role=option selector for better reliability with Mantine dropdowns
    await page.getByRole('option', { name: /v1\.0.*document/i }).click();

    // Wait for split dropdown to be enabled
    await page.waitForTimeout(500);

    // Then: Split dropdown should be enabled and show splits for that version
    await expect(formDialog.splitSelect).toBeEnabled();

    // Open split dropdown
    await formDialog.splitSelect.click();

    // Should show "train" split from seed data
    const trainSplitOption = page.getByRole('option', { name: /train/i });
    await expect(trainSplitOption.first()).toBeVisible();
  });

  // REQ US-029 Scenario 4: Workflow Dropdown Loads
  test('should populate workflow dropdown with available workflows', async ({ page }) => {
    // Given: Workflows exist in the system
    await projectPage.goto(SEED_PROJECT_ID);

    // When: User opens the workflow dropdown
    await projectPage.clickCreateDefinition();
    await formDialog.waitForDialogToOpen();
    await formDialog.workflowSelect.click();

    // Then: Available workflows are listed with format: "{name} (v{version})"
    // Seed data has "Standard OCR Workflow" v1
    const workflowOption = page.getByText(/Standard OCR Workflow.*v\d+/i);
    await expect(workflowOption.first()).toBeVisible();
  });

  // REQ US-029 Scenario 5: Evaluator Type Dropdown
  test('should show evaluator type dropdown with available types', async ({ page }) => {
    // Given: User is filling out the definition form
    await projectPage.goto(SEED_PROJECT_ID);
    await projectPage.clickCreateDefinition();
    await formDialog.waitForDialogToOpen();

    // When: User opens the evaluator type dropdown
    await formDialog.evaluatorTypeSelect.click();

    // Then: Available evaluator types are listed
    // Should show "Schema-Aware" and "Black-Box" based on requirements
    const schemaAwareOption = page.getByText(/Schema-Aware/i);
    const blackBoxOption = page.getByText(/Black-Box/i);

    await expect(schemaAwareOption.first()).toBeVisible();
    await expect(blackBoxOption.first()).toBeVisible();
  });

  // REQ US-029 Scenario 6: Evaluator Config JSON Editor
  test('should display evaluator config JSON editor with validation', async ({ page }) => {
    // Given: User has selected an evaluator type
    await projectPage.goto(SEED_PROJECT_ID);
    await projectPage.clickCreateDefinition();
    await formDialog.waitForDialogToOpen();

    // When: Evaluator config section is rendered
    // Then: JSON editor is displayed
    await expect(formDialog.evaluatorConfigTextarea).toBeVisible();

    // Should have placeholder
    const placeholder = await formDialog.evaluatorConfigTextarea.getAttribute('placeholder');
    expect(placeholder).toBeTruthy();

    // Test JSON validation by entering valid JSON
    await formDialog.fillEvaluatorConfig('{"key": "value"}');
    const value = await formDialog.evaluatorConfigTextarea.inputValue();
    expect(value).toBe('{"key": "value"}');
  });

  // REQ US-029 Scenario 7: Runtime Settings Form
  test('should display runtime settings with default values and validation', async ({ page }) => {
    // Given: User is filling out the definition form
    await projectPage.goto(SEED_PROJECT_ID);
    await projectPage.clickCreateDefinition();
    await formDialog.waitForDialogToOpen();

    // When: Runtime settings section is visible
    // Then: Fields include maxParallelDocuments, perDocumentTimeout, useProductionQueue
    await expect(formDialog.maxParallelDocsInput).toBeVisible();
    await expect(formDialog.perDocTimeoutInput).toBeVisible();
    await expect(formDialog.productionQueueNo).toBeVisible();
    await expect(formDialog.productionQueueYes).toBeVisible();

    // Should have default values
    const maxParallelValue = await formDialog.maxParallelDocsInput.inputValue();
    const timeoutValue = await formDialog.perDocTimeoutInput.inputValue();

    expect(parseInt(maxParallelValue)).toBeGreaterThan(0);
    expect(parseInt(timeoutValue)).toBeGreaterThan(0);
  });

  // REQ US-029 Scenario 8: Artifact Policy Selection
  test('should display artifact policy radio buttons with default selection', async ({ page }) => {
    // Given: User is filling out the definition form
    await projectPage.goto(SEED_PROJECT_ID);
    await projectPage.clickCreateDefinition();
    await formDialog.waitForDialogToOpen();

    // When: Artifact policy section is rendered
    // Then: Radio buttons for full, failures_only, sampled are visible
    await expect(formDialog.artifactPolicyFull).toBeVisible();
    await expect(formDialog.artifactPolicyFailures).toBeVisible();
    await expect(formDialog.artifactPolicySampled).toBeVisible();

    // One option should be selected by default (failures_only based on exploration)
    const isFailuresChecked = await formDialog.artifactPolicyFailures.isChecked();
    expect(isFailuresChecked).toBeTruthy();

    // Should be able to change selection
    await formDialog.artifactPolicyFull.click();
    const isFullChecked = await formDialog.artifactPolicyFull.isChecked();
    expect(isFullChecked).toBeTruthy();
  });
});
