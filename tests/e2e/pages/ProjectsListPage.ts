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
}
