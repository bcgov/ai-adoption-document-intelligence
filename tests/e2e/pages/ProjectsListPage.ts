import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for Projects List page
 * /benchmarking/projects
 */
export class ProjectsListPage {
  readonly page: Page;

  // Header elements
  readonly header: Locator;
  readonly pageTitle: Locator;
  readonly createProjectBtn: Locator;

  // Empty state
  readonly emptyStateContainer: Locator;
  readonly emptyStateTitle: Locator;
  readonly createProjectEmptyBtn: Locator;

  // Table elements
  readonly projectsTable: Locator;
  readonly projectRows: Locator;

  // Loading state
  readonly loadingSpinner: Locator;

  // Create Project Dialog
  readonly createProjectDialog: Locator;
  readonly dialogTitle: Locator;
  readonly dialogCloseBtn: Locator;

  // Dialog form fields
  readonly projectNameInput: Locator;
  readonly projectDescriptionInput: Locator;

  // Dialog actions
  readonly cancelProjectBtn: Locator;
  readonly submitProjectBtn: Locator;

  // Error messages
  readonly nameErrorMessage: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header
    this.header = page.locator('[data-testid="projects-header"]');
    this.pageTitle = page.getByRole('heading', { name: 'Benchmark Projects', level: 2 });
    this.createProjectBtn = page.locator('[data-testid="create-project-btn"]');

    // Empty state
    this.emptyStateContainer = page.locator('[data-testid="projects-empty-state"]');
    this.emptyStateTitle = page.getByText('No projects yet');
    this.createProjectEmptyBtn = page.locator('[data-testid="create-project-empty-btn"]');

    // Table
    this.projectsTable = page.locator('[data-testid="projects-table"]');
    this.projectRows = page.locator('[data-testid^="project-row-"]');

    // Loading
    this.loadingSpinner = page.locator('role=generic >> role=generic[name="Loader"]');

    // Create Project Dialog
    this.createProjectDialog = page.locator('[data-testid="create-project-dialog"]');
    this.dialogTitle = page.getByRole('heading', { name: 'Create New Project' });
    // Mantine Modal close button - the button in the header/banner without text
    this.dialogCloseBtn = this.createProjectDialog.getByRole('banner').getByRole('button').first();

    // Dialog form fields
    this.projectNameInput = page.locator('[data-testid="project-name-input"]');
    this.projectDescriptionInput = page.locator('[data-testid="project-description-input"]');

    // Dialog actions
    this.cancelProjectBtn = page.locator('[data-testid="cancel-project-btn"]');
    this.submitProjectBtn = page.locator('[data-testid="submit-project-btn"]');

    // Error messages
    this.nameErrorMessage = page.getByText('Project name is required');
  }

  /**
   * Navigate to this page from anywhere in the app
   */
  async goto() {
    await this.page.goto('/benchmarking/projects');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Click on a project row to view details
   * @param projectId - The ID of the project to click
   */
  async clickProject(projectId: string) {
    const row = this.page.locator(`[data-testid="project-row-${projectId}"]`);
    await row.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Click on the first project in the list
   */
  async clickFirstProject() {
    await this.projectRows.first().click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Get project row by ID
   */
  getProjectRow(projectId: string): Locator {
    return this.page.locator(`[data-testid="project-row-${projectId}"]`);
  }

  /**
   * Open the create project dialog by clicking the header button
   */
  async openCreateDialog() {
    await this.createProjectBtn.click();
    await this.dialogTitle.waitFor({ state: 'visible' });
    await this.projectNameInput.waitFor({ state: 'visible' });
  }

  /**
   * Open the create project dialog from empty state
   */
  async openCreateDialogFromEmptyState() {
    await this.createProjectEmptyBtn.click();
    await this.dialogTitle.waitFor({ state: 'visible' });
    await this.projectNameInput.waitFor({ state: 'visible' });
  }

  /**
   * Fill in the create project form
   */
  async fillProjectForm(data: { name: string; description?: string }) {
    await this.projectNameInput.fill(data.name);

    if (data.description) {
      await this.projectDescriptionInput.fill(data.description);
    }
  }

  /**
   * Submit the create project form
   */
  async submitCreateForm() {
    await this.submitProjectBtn.click();
  }

  /**
   * Cancel the create project dialog
   */
  async cancelCreateDialog() {
    await this.cancelProjectBtn.click();
    await this.dialogTitle.waitFor({ state: 'hidden' });
  }

  /**
   * Close the dialog using the X button
   */
  async closeDialog() {
    await this.dialogCloseBtn.click();
    await this.dialogTitle.waitFor({ state: 'hidden' });
  }

  /**
   * Create a project with all steps combined
   */
  async createProject(data: { name: string; description?: string }) {
    await this.openCreateDialog();
    await this.fillProjectForm(data);

    // Wait for the POST request to be sent
    const createRequestPromise = this.page.waitForResponse(
      (response) =>
        response.url().includes('/benchmark/projects') && response.request().method() === 'POST',
      { timeout: 10000 }
    );

    await this.submitCreateForm();

    // Wait for the API request to complete
    await createRequestPromise;

    // Wait for dialog to close (success case)
    await this.dialogTitle.waitFor({ state: 'hidden', timeout: 5000 });

    // Wait for the list to refresh
    await this.page.waitForLoadState('networkidle');

    // Extra wait for React Query to refetch and update the list
    await this.page.waitForTimeout(1000);
  }
}
