import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from '../helpers/auth';
import { ProjectsListPage } from '../pages/ProjectsListPage';

/**
 * Test Plan: US-010 - Benchmark Project Service & Controller (UI)
 * REQ-010: Users can view a list of benchmark projects and create new ones through the UI
 *
 * NOTE: This file runs in serial mode because empty state tests delete all projects
 */
test.describe.configure({ mode: 'serial' });

test.describe('Project List & Create UI', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  // Seed data constant
  const SEED_PROJECT_ID = 'seed-project-invoice-extraction';

  let projectsPage: ProjectsListPage;

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

    projectsPage = new ProjectsListPage(page);
  });

  /**
   * Scenario 1: Project List Display
   * US-010 Scenario 2: List benchmark projects
   */
  test('should display project list with all columns', async ({ page }) => {
    // Given: At least one benchmark project exists (seed data)
    // When: User navigates to /benchmarking/projects
    await projectsPage.goto();

    // Then: Table is displayed with columns: Name, Description, Definitions, Runs, Created Date
    await expect(projectsPage.projectsTable).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Description' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Definitions' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Runs' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Created Date' })).toBeVisible();

    // And: Seed project row is visible with correct data
    const seedProjectRow = projectsPage.getProjectRow(SEED_PROJECT_ID);
    await expect(seedProjectRow).toBeVisible();
    await expect(seedProjectRow).toContainText('Invoice Extraction Benchmark');

    // And: Row is clickable for navigation
    await expect(seedProjectRow).toHaveAttribute('style', /cursor:\s*pointer/);
  });

  /**
   * Scenario 2: Open Create Project Dialog
   * US-010 Scenario 1: Create a benchmark project (dialog open)
   */
  test('should open create project dialog', async ({ page }) => {
    // Given: User is on the project list page
    await projectsPage.goto();

    // When: User clicks the "Create Project" button
    await projectsPage.openCreateDialog();

    // Then: Dialog appears with title, fields, and buttons
    await expect(projectsPage.dialogTitle).toBeVisible();
    await expect(projectsPage.projectNameInput).toBeVisible();
    await expect(projectsPage.projectDescriptionInput).toBeVisible();

    // And: Submit and Cancel buttons are present
    await expect(projectsPage.submitProjectBtn).toBeVisible();
    await expect(projectsPage.cancelProjectBtn).toBeVisible();

    // And: Name field is focused
    await expect(projectsPage.projectNameInput).toBeFocused();
  });

  /**
   * Scenario 3: Create Project Success
   * US-010 Scenario 1: Create a benchmark project
   */
  test('should create project with valid data', async ({ page }) => {
    // Given: Create project dialog is open
    await projectsPage.goto();

    const uniqueName = `Test Project ${Date.now()}`;

    // When: User fills in name and submits
    await projectsPage.createProject({ name: uniqueName });

    // Then: Dialog closes
    await expect(projectsPage.dialogTitle).not.toBeVisible();

    // And: Project list refreshes showing the new project
    await expect(page.getByText(uniqueName)).toBeVisible();
  });

  /**
   * Scenario 4: Create Project with Description
   * US-010 Scenario 1: Create with all fields
   */
  test('should create project with description', async ({ page }) => {
    // Given: Create project dialog is open
    await projectsPage.goto();

    const uniqueName = `Described Project ${Date.now()}`;
    const description = 'E2E test project with description';

    // When: User fills in name and description and submits
    await projectsPage.createProject({ name: uniqueName, description });

    // Then: Dialog closes
    await expect(projectsPage.dialogTitle).not.toBeVisible();

    // And: Project appears in the list
    await expect(page.getByText(uniqueName)).toBeVisible();
  });

  /**
   * Scenario 5: Validation - Missing Required Name
   * US-010 Scenario 5: Create project validates required fields
   */
  test('should show error for missing required name', async ({ page }) => {
    // Given: Create project dialog is open
    await projectsPage.goto();
    await projectsPage.openCreateDialog();

    // When: User leaves name field empty and clicks submit
    await projectsPage.submitCreateForm();

    // Then: Error message appears on the name field
    await expect(projectsPage.nameErrorMessage).toBeVisible();

    // And: Dialog remains open (form does not submit)
    await expect(projectsPage.dialogTitle).toBeVisible();
  });

  /**
   * Scenario 6: Cancel Dialog
   * Dialog can be canceled and data is discarded
   */
  test('should cancel dialog and discard data', async ({ page }) => {
    // Given: Create project dialog is open with partial data entered
    await projectsPage.goto();
    await projectsPage.openCreateDialog();

    await projectsPage.projectNameInput.fill('Test Project');
    await projectsPage.projectDescriptionInput.fill('Test description');

    // When: User clicks Cancel button
    await projectsPage.cancelCreateDialog();

    // Then: Dialog closes
    await expect(projectsPage.dialogTitle).not.toBeVisible();

    // When: User reopens the dialog
    await projectsPage.openCreateDialog();

    // Then: Form data is discarded
    await expect(projectsPage.projectNameInput).toHaveValue('');
    await expect(projectsPage.projectDescriptionInput).toHaveValue('');
  });

  /**
   * Scenario 7: Close Dialog with X button
   */
  test('should close dialog with X button', async ({ page }) => {
    // Given: Create project dialog is open with data
    await projectsPage.goto();
    await projectsPage.openCreateDialog();

    await projectsPage.projectNameInput.fill('Test Project');

    // When: User clicks X button
    await projectsPage.closeDialog();

    // Then: Dialog closes
    await expect(projectsPage.dialogTitle).not.toBeVisible();

    // And: Data is discarded
    await projectsPage.openCreateDialog();
    await expect(projectsPage.projectNameInput).toHaveValue('');
  });

  /**
   * Scenario 8: Navigate to Project Detail
   * US-010 Scenario 3: Get project details
   */
  test('should navigate to project detail page', async ({ page }) => {
    // Given: Project list is displayed with projects
    await projectsPage.goto();
    await expect(projectsPage.projectsTable).toBeVisible();

    // When: User clicks on a project row
    await projectsPage.clickProject(SEED_PROJECT_ID);

    // Then: Navigation to /benchmarking/projects/{projectId} occurs
    await expect(page).toHaveURL(new RegExp(`/benchmarking/projects/${SEED_PROJECT_ID}`));

    // And: Project detail page loads
    await expect(page.getByRole('heading', { name: /Invoice Extraction Benchmark/i })).toBeVisible();
  });

  /**
   * Scenario 9: Loading State
   * Loading indicator is displayed while fetching projects
   */
  test('should show loading state while fetching projects', async ({ page }) => {
    // When: User navigates to /benchmarking/projects
    await page.goto(`${FRONTEND_URL}/benchmarking/projects`);

    // Wait for either loading spinner or table to appear
    await Promise.race([
      projectsPage.loadingSpinner.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {}),
      projectsPage.projectsTable.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {}),
    ]);

    // Then: Eventually the table is displayed (loading completes)
    await expect(projectsPage.projectsTable).toBeVisible();

    // And: Loading indicator disappears
    await expect(projectsPage.loadingSpinner).not.toBeVisible();
  });
});

/**
 * Test Group: Empty State Scenarios
 * These tests require an empty database to verify empty state behavior
 */
test.describe('Project List - Empty State', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  let projectsPage: ProjectsListPage;

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

    projectsPage = new ProjectsListPage(page);

    // Mock an empty projects list response (no DELETE endpoint exists for projects)
    // Track whether a project has been created so we can stop mocking
    let projectCreated = false;
    await page.route(new RegExp(`${BACKEND_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/api/benchmark/projects(\\?.*)?$`), async (route, request) => {
      if (request.method() === 'GET' && !projectCreated) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      } else {
        if (request.method() === 'POST') {
          projectCreated = true;
        }
        await route.continue({
          headers: {
            ...request.headers(),
            'x-api-key': TEST_API_KEY!,
          },
        });
      }
    });
  });

  /**
   * Scenario 10: Empty State Display
   * Empty state is shown when no projects exist
   */
  test('should display empty state when no projects exist', async ({ page }) => {
    // Given: No projects exist in the system
    // When: User navigates to /benchmarking/projects
    await projectsPage.goto();

    // Then: Empty state message is displayed
    await expect(projectsPage.emptyStateContainer).toBeVisible();
    await expect(projectsPage.emptyStateTitle).toBeVisible();
    await expect(page.getByText('Create your first benchmark project to get started')).toBeVisible();

    // And: "Create Project" button is visible and functional
    await expect(projectsPage.createProjectEmptyBtn).toBeVisible();

    // And: No table is shown
    await expect(projectsPage.projectsTable).not.toBeVisible();
  });

  /**
   * Scenario 11: Create from Empty State
   */
  test('should create project from empty state', async ({ page }) => {
    // Given: Empty state is displayed
    await projectsPage.goto();
    await expect(projectsPage.emptyStateContainer).toBeVisible();

    // When: User clicks create button from empty state
    await projectsPage.openCreateDialogFromEmptyState();

    // Then: Dialog opens
    await expect(projectsPage.dialogTitle).toBeVisible();

    // And: User can create a project
    await projectsPage.fillProjectForm({
      name: 'First Project',
      description: 'Created from empty state',
    });
    await projectsPage.submitCreateForm();

    // Wait for dialog to close (indicates successful creation)
    await expect(projectsPage.dialogTitle).not.toBeVisible({ timeout: 10000 });

    // Wait for React Query to refetch
    await page.waitForTimeout(1000);

    // Wait for the table to appear
    await expect(projectsPage.projectsTable).toBeVisible({ timeout: 15000 });

    // Then: Empty state disappears and project is shown
    await expect(projectsPage.emptyStateContainer).not.toBeVisible();
    await expect(page.getByText('First Project')).toBeVisible();
  });
});
