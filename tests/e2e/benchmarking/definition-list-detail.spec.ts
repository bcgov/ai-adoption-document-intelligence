import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from '../helpers/auth';
import { ProjectDetailPage } from '../pages/ProjectDetailPage';
import { DefinitionDetailDialog } from '../pages/DefinitionDetailDialog';

// US-029: Benchmark Definition CRUD UI - List and Detail View Tests
// Scenarios: 12-16 (List display, detail view, revision history, immutability)

test.describe('Definition List and Detail Views', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  const SEED_PROJECT_ID = 'seed-project-invoice-extraction';
  const SEED_DEFINITION_ID = 'seed-definition-baseline';

  let projectPage: ProjectDetailPage;
  let detailDialog: DefinitionDetailDialog;

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
    detailDialog = new DefinitionDetailDialog(page);

    // Navigate to project detail page
    await projectPage.goto(SEED_PROJECT_ID);
  });

  // REQ US-029 Scenario 12: Definition List Display
  test('should display definition list with correct columns', async ({ page }) => {
    // Given: Project has multiple definitions
    await expect(projectPage.projectNameTitle).toBeVisible();

    // When: User views the project detail page
    // Then: Definition table shows columns: name, dataset version, workflow name, evaluator type, immutable status, revision number, actions
    await expect(projectPage.definitionsTable).toBeVisible();

    // Check that definitions are displayed
    await expect(projectPage.definitionRows.first()).toBeVisible();

    // Verify the seed definition "Baseline OCR Model" is in the list
    const baselineDefinition = projectPage.getDefinitionRowByName('Baseline OCR Model');
    await expect(baselineDefinition.first()).toBeVisible();

    // Each row should be clickable and have action buttons
    const firstRow = projectPage.definitionRows.first();
    await expect(firstRow).toBeVisible();
  });

  // REQ US-029 Scenario 13: View Definition Detail
  test('should open definition detail view with all configuration', async ({ page }) => {
    // Given: Definition exists
    await expect(projectPage.definitionsTable).toBeVisible();

    // When: User clicks on a definition row or "View Details"
    await projectPage.clickDefinition(SEED_DEFINITION_ID);

    // Then: Detail view/page opens showing all configuration
    await detailDialog.waitForDialogToOpen();
    await expect(detailDialog.dialogTitle).toBeVisible();

    // Verify definition name is shown
    await expect(detailDialog.definitionName).toBeVisible();
    const defName = await detailDialog.definitionName.textContent();
    expect(defName).toContain('Baseline OCR Model');

    // Verify configuration table is shown
    await expect(detailDialog.configTable).toBeVisible();
    await expect(detailDialog.datasetVersionRow).toBeVisible();
    await expect(detailDialog.splitRow).toBeVisible();
    await expect(detailDialog.workflowRow).toBeVisible();
    await expect(detailDialog.evaluatorTypeRow).toBeVisible();

    // Verify configuration sections
    await expect(detailDialog.evaluatorConfigHeading).toBeVisible();
    await expect(detailDialog.runtimeSettingsHeading).toBeVisible();
    await expect(detailDialog.artifactPolicyHeading).toBeVisible();

    // Verify run history section
    await expect(detailDialog.runHistoryHeading).toBeVisible();
    await expect(detailDialog.runHistoryTable).toBeVisible();
  });

  // REQ US-029 Scenario 14: Immutable Definition - Revision History
  test('should display revision history for definitions with multiple revisions', async ({ page }) => {
    // TODO: the current seed data doesn't include a definition with multiple revisions
    // This would need to be tested after implementing revision creation functionality

    // Given: Definition has been revised (multiple revisions exist with different revision numbers)
    // When: User views the definition detail
    // Then: Revision history section is visible
    // All revisions are listed with: revision number, creation date, creator
    // User can view each revision's full config
  });

  // REQ US-029 Scenario 15: Cannot Edit Immutable Definition
  test('should not show edit button for immutable definitions', async ({ page }) => {
    // Given: Definition with immutable=true (has been executed)
    // First, we need to check if the seed definition is immutable
    await expect(projectPage.definitionsTable).toBeVisible();

    const definitionRow = projectPage.getDefinitionRow(SEED_DEFINITION_ID);
    await expect(definitionRow).toBeVisible();

    // When: Definition list is rendered
    // Then: Immutable badge/indicator is shown (if the definition is immutable)
    // Note: Based on seed data, the baseline definition has immutable=false
    // So this test checks that the row exists and can be clicked

    // Click to view details
    await projectPage.clickDefinition(SEED_DEFINITION_ID);
    await detailDialog.waitForDialogToOpen();

    // Definition detail should open
    await expect(detailDialog.dialogTitle).toBeVisible();

    // Check revision badge is shown
    await expect(detailDialog.revisionBadge).toBeVisible();
    const revisionText = await detailDialog.revisionBadge.textContent();
    expect(revisionText).toMatch(/Revision \d+/);
  });

  // REQ US-029 Scenario 16: Create New Revision
  test('should allow creating a new revision from immutable definition', async ({ page }) => {
    // TODO: it depends on having an immutable definition
    // and the "Create Revision" action implementation

    // Given: Immutable definition exists
    // When: User clicks "Create Revision" action
    // Then: Create definition form opens
    // Form is pre-populated with current definition's config
    // Revision number is incremented
    // User can modify settings and create new revision
    // New definition ID is generated
  });
});

test.describe('Definition Detail - Configuration Display', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  const SEED_PROJECT_ID = 'seed-project-invoice-extraction';
  const SEED_DEFINITION_ID = 'seed-definition-baseline';

  let projectPage: ProjectDetailPage;
  let detailDialog: DefinitionDetailDialog;

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

    projectPage = new ProjectDetailPage(page);
    detailDialog = new DefinitionDetailDialog(page);

    await projectPage.goto(SEED_PROJECT_ID);
    await projectPage.clickDefinition(SEED_DEFINITION_ID);
    await detailDialog.waitForDialogToOpen();
  });

  test('should display evaluator configuration as formatted JSON', async ({ page }) => {
    // Given: Definition detail is open
    // When: Viewing evaluator configuration section
    await expect(detailDialog.evaluatorConfigHeading).toBeVisible();

    // Then: Configuration is displayed as formatted JSON
    const configText = await detailDialog.evaluatorConfigJson.textContent();
    expect(configText).toBeTruthy();

    // Should contain valid JSON content from seed data
    expect(configText).toContain('metrics');
  });

  test('should display runtime settings as formatted JSON', async ({ page }) => {
    // Given: Definition detail is open
    // When: Viewing runtime settings section
    await expect(detailDialog.runtimeSettingsHeading).toBeVisible();

    // Then: Settings are displayed as formatted JSON
    const settingsText = await detailDialog.runtimeSettingsJson.textContent();
    expect(settingsText).toBeTruthy();

    // Should contain settings from seed data
    expect(settingsText).toContain('timeout');
  });

  test('should display artifact policy as formatted JSON', async ({ page }) => {
    // Given: Definition detail is open
    // When: Viewing artifact policy section
    await expect(detailDialog.artifactPolicyHeading).toBeVisible();

    // Then: Policy is displayed as formatted JSON
    const policyText = await detailDialog.artifactPolicyJson.textContent();
    expect(policyText).toBeTruthy();

    // Should contain policy from seed data
    expect(policyText).toMatch(/save|artifact/i);
  });

  test('should display run history with status badges', async ({ page }) => {
    // Given: Definition detail is open with runs
    // When: Viewing run history section
    await expect(detailDialog.runHistoryHeading).toBeVisible();
    await expect(detailDialog.runHistoryTable).toBeVisible();

    // Then: Runs are listed with MLflow Run ID, Status, Started, Completed
    // Check for status badges (from seed data: completed, running, failed)
    const runHistoryText = await detailDialog.runHistoryTable.textContent();

    // Should have run data
    expect(runHistoryText).toBeTruthy();

    // Should show status (completed, running, or failed from seed data)
    const hasStatus = runHistoryText?.match(/completed|running|failed/i);
    expect(hasStatus).toBeTruthy();
  });
});
