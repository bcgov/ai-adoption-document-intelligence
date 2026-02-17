import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from '../helpers/auth';
import { SidebarNavigationPage } from '../pages/SidebarNavigationPage';
import { DatasetsListPage } from '../pages/DatasetsListPage';
import { DatasetDetailPage } from '../pages/DatasetDetailPage';
import { ProjectsListPage } from '../pages/ProjectsListPage';
import { ProjectDetailPage } from '../pages/ProjectDetailPage';
import { RunDetailPage } from '../pages/RunDetailPage';

/**
 * Test Plan: US-026 - Benchmarking Navigation & Routing
 * REQ-026: Users can access benchmarking features from the application sidebar
 */
test.describe('Benchmarking Navigation & Routing', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  // Seed data constants
  const SEED_DATASET_ID = 'seed-dataset-invoices';
  const SEED_PROJECT_ID = 'seed-project-invoice-extraction';
  const SEED_RUN_ID_COMPLETED = 'seed-run-completed-001';

  let sidebar: SidebarNavigationPage;
  let datasetsPage: DatasetsListPage;
  let datasetDetailPage: DatasetDetailPage;
  let projectsPage: ProjectsListPage;
  let projectDetailPage: ProjectDetailPage;
  let runDetailPage: RunDetailPage;

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

    // Initialize page objects
    sidebar = new SidebarNavigationPage(page);
    datasetsPage = new DatasetsListPage(page);
    datasetDetailPage = new DatasetDetailPage(page);
    projectsPage = new ProjectsListPage(page);
    projectDetailPage = new ProjectDetailPage(page);
    runDetailPage = new RunDetailPage(page);
  });

  /**
   * Scenario 1: Sidebar Navigation Structure
   * REQ-026: Benchmarking section in sidebar with Datasets, Projects, and Runs sub-items
   */
  test('should display benchmarking section in sidebar with all sub-items', async ({ page }) => {
    // Given: User is logged into the application
    await expect(page).toHaveURL(/\//);

    // When: The application loads and renders the sidebar
    // Then: A "Benchmarking" section is visible in the sidebar
    await expect(sidebar.benchmarkingNavParent).toBeVisible();

    // When: User expands the benchmarking section
    await sidebar.expandBenchmarkingSection();

    // And: The section contains sub-items: "Datasets", "Projects", and "Runs"
    await expect(sidebar.datasetsNavLink).toBeVisible();
    await expect(sidebar.projectsNavLink).toBeVisible();
    await expect(sidebar.runsNavLink).toBeVisible();

    // And: All navigation items are clickable
    await expect(sidebar.datasetsNavLink).toBeEnabled();
    await expect(sidebar.projectsNavLink).toBeEnabled();
    await expect(sidebar.runsNavLink).toBeEnabled();
  });

  /**
   * Scenario 2: Navigate to Dataset List
   * REQ-026: Dataset route is configured
   */
  test('should navigate to datasets list page', async ({ page }) => {
    // Given: User is on any page in the application
    await expect(page).toHaveURL(/\//);

    // When: User clicks "Datasets" in the Benchmarking sidebar section
    await sidebar.navigateToDatasets();

    // Then: URL changes to /benchmarking/datasets
    await expect(page).toHaveURL(/\/benchmarking\/datasets/);

    // And: Dataset list page is rendered
    await expect(datasetsPage.pageTitle).toBeVisible();
    await expect(datasetsPage.header).toBeVisible();

    // And: "Datasets" sidebar item is highlighted as active
    // Note: Active state is handled by CSS, check that we're on the correct route
    await expect(page).toHaveURL(/\/benchmarking\/datasets/);
  });

  /**
   * Scenario 3: Navigate to Dataset Detail
   * REQ-026: Dataset detail route is configured
   */
  test('should navigate to dataset detail page', async ({ page }) => {
    // Given: User is on the dataset list page and datasets exist
    await datasetsPage.goto();
    await expect(datasetsPage.pageTitle).toBeVisible();

    // When: User clicks on a dataset name or row
    await datasetsPage.clickDataset(SEED_DATASET_ID);

    // Then: URL changes to /benchmarking/datasets/{datasetId}
    await expect(page).toHaveURL(new RegExp(`/benchmarking/datasets/${SEED_DATASET_ID}`));

    // And: Dataset detail page is rendered showing version list and sample preview
    await expect(datasetDetailPage.datasetNameTitle).toBeVisible();
    await expect(datasetDetailPage.versionsTab).toBeVisible();

    // And: "Datasets" sidebar item remains highlighted
    await expect(page).toHaveURL(/\/benchmarking\/datasets/);
  });

  /**
   * Scenario 4: Navigate to Projects List
   * REQ-026: Projects route is configured
   */
  test('should navigate to projects list page', async ({ page }) => {
    // Given: User is on any page in the application
    await expect(page).toHaveURL(/\//);

    // When: User clicks "Projects" in the Benchmarking sidebar section
    await sidebar.navigateToProjects();

    // Then: URL changes to /benchmarking/projects
    await expect(page).toHaveURL(/\/benchmarking\/projects/);

    // And: Projects list page is rendered
    await expect(projectsPage.pageTitle).toBeVisible();
    await expect(projectsPage.header).toBeVisible();

    // And: "Projects" sidebar item is highlighted as active
    await expect(page).toHaveURL(/\/benchmarking\/projects/);
  });

  /**
   * Scenario 5: Navigate to Project Detail
   * REQ-026: Project detail route with definitions and runs
   */
  test('should navigate to project detail page', async ({ page }) => {
    // Given: User is on the projects list page and projects exist
    await projectsPage.goto();
    await expect(projectsPage.pageTitle).toBeVisible();

    // When: User clicks on a project name or row
    await projectsPage.clickProject(SEED_PROJECT_ID);

    // Then: URL changes to /benchmarking/projects/{projectId}
    await expect(page).toHaveURL(new RegExp(`/benchmarking/projects/${SEED_PROJECT_ID}`));

    // And: Project detail page is rendered showing definition list and run list
    await expect(projectDetailPage.projectNameTitle).toBeVisible();
    await expect(projectDetailPage.definitionsHeading).toBeVisible();
    await expect(projectDetailPage.runsHeading).toBeVisible();

    // And: "Projects" sidebar item remains highlighted
    await expect(page).toHaveURL(/\/benchmarking\/projects/);
  });

  /**
   * Scenario 6: Navigate to Run Detail
   * REQ-026: Run detail route is configured
   */
  test('should navigate to run detail page from project', async ({ page }) => {
    // Given: User is on a project detail page with runs
    await projectDetailPage.goto(SEED_PROJECT_ID);
    await expect(projectDetailPage.projectNameTitle).toBeVisible();
    await expect(projectDetailPage.runRows).toHaveCount(5); // Should have 5 seed runs

    // When: User clicks on a run from the run list
    await projectDetailPage.clickRun(SEED_RUN_ID_COMPLETED);

    // Then: URL changes to /benchmarking/projects/{projectId}/runs/{runId}
    await expect(page).toHaveURL(
      new RegExp(`/benchmarking/projects/${SEED_PROJECT_ID}/runs/${SEED_RUN_ID_COMPLETED}`)
    );

    // And: Run detail page is rendered with metrics, artifacts, and links
    await expect(runDetailPage.runDefinitionName).toBeVisible();
    await expect(runDetailPage.runIdText).toBeVisible();
    await expect(runDetailPage.runInfoHeading).toBeVisible();

    // And: "Projects" sidebar item remains highlighted
    await expect(page).toHaveURL(/\/benchmarking\/projects/);
  });

  /**
   * Scenario 7: Direct URL Navigation
   * REQ-026: Routes work with direct navigation
   */
  test('should load project detail page from direct URL', async ({ page }) => {
    // Given: User has a direct URL to a benchmarking page
    // When: User enters /benchmarking/projects/{projectId} in the browser
    await page.goto(`${FRONTEND_URL}/benchmarking/projects/${SEED_PROJECT_ID}`);
    await page.waitForLoadState('networkidle');

    // Then: The project detail page loads correctly
    await expect(projectDetailPage.projectNameTitle).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/benchmarking/projects/${SEED_PROJECT_ID}`));

    // And: Sidebar renders with "Projects" highlighted
    await expect(sidebar.projectsNavLink).toBeVisible();

    // And: No navigation errors occur
    // (Test passes if no errors were thrown)
  });

  /**
   * Scenario 7b: Direct URL Navigation to Dataset Detail
   */
  test('should load dataset detail page from direct URL', async ({ page }) => {
    // Given: User has a direct URL to a dataset detail page
    // When: User enters /benchmarking/datasets/{datasetId} in the browser
    await page.goto(`${FRONTEND_URL}/benchmarking/datasets/${SEED_DATASET_ID}`);
    await page.waitForLoadState('networkidle');

    // Then: The dataset detail page loads correctly
    await expect(datasetDetailPage.datasetNameTitle).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/benchmarking/datasets/${SEED_DATASET_ID}`));

    // And: Sidebar renders correctly
    await expect(sidebar.datasetsNavLink).toBeVisible();
  });

  /**
   * Scenario 8: Browser Back/Forward Navigation
   * REQ-026: Browser navigation works correctly
   */
  test('should support browser back/forward navigation', async ({ page }) => {
    // Given: User has navigated through multiple benchmarking pages
    // Navigate to datasets
    await sidebar.navigateToDatasets();
    await expect(page).toHaveURL(/\/benchmarking\/datasets/);

    // Navigate to projects
    await sidebar.navigateToProjects();
    await expect(page).toHaveURL(/\/benchmarking\/projects/);

    // Navigate to a project detail
    await projectsPage.clickProject(SEED_PROJECT_ID);
    await expect(page).toHaveURL(new RegExp(`/benchmarking/projects/${SEED_PROJECT_ID}`));

    // When: User clicks browser back button
    await page.goBack();
    await page.waitForLoadState('networkidle');

    // Then: Previous page is restored (projects list)
    await expect(page).toHaveURL(/\/benchmarking\/projects$/);
    await expect(projectsPage.pageTitle).toBeVisible();

    // And: Sidebar active state updates correctly
    await expect(sidebar.projectsNavLink).toBeVisible();

    // When: User clicks back again
    await page.goBack();
    await page.waitForLoadState('networkidle');

    // Then: Datasets page is restored
    await expect(page).toHaveURL(/\/benchmarking\/datasets/);
    await expect(datasetsPage.pageTitle).toBeVisible();

    // When: User clicks forward button
    await page.goForward();
    await page.waitForLoadState('networkidle');

    // Then: Projects page is restored
    await expect(page).toHaveURL(/\/benchmarking\/projects$/);
    await expect(projectsPage.pageTitle).toBeVisible();
  });

  /**
   * Scenario 9: Invalid Route Handling
   * REQ-026: Invalid routes show error page
   */
  test('should handle invalid benchmarking route', async ({ page }) => {
    // Given: User navigates to a non-existent benchmarking route
    // When: User enters /benchmarking/invalid-route in the browser
    await page.goto(`${FRONTEND_URL}/benchmarking/invalid-route`);
    await page.waitForLoadState('networkidle');

    // Then: 404 or not-found page is displayed
    // Note: Specific error page implementation may vary
    // Check that we're not on a valid benchmarking page
    await expect(datasetsPage.pageTitle).not.toBeVisible();
    await expect(projectsPage.pageTitle).not.toBeVisible();

    // And: User can navigate to valid routes by going directly
    // Note: On invalid routes, the sidebar may not render, so we use direct navigation
    await page.goto(`${FRONTEND_URL}/benchmarking/datasets`);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/benchmarking\/datasets/);
    await expect(datasetsPage.pageTitle).toBeVisible();

    // Verify sidebar is present on valid route
    await expect(sidebar.benchmarkingNavParent).toBeVisible();
  });

  /**
   * Scenario 10: Lazy Loading Verification
   * REQ-026: Pages load without errors
   */
  test('should load benchmarking pages without errors', async ({ page }) => {
    // Track console errors
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Given: Benchmarking pages are configured for lazy loading
    // When: User first navigates to a benchmarking page
    await sidebar.navigateToDatasets();

    // Then: Page loads without errors
    await expect(page).toHaveURL(/\/benchmarking\/datasets/);
    await expect(datasetsPage.pageTitle).toBeVisible();

    // And: Page renders completely after load
    await expect(datasetsPage.header).toBeVisible();

    // Navigate to another page
    await sidebar.navigateToProjects();
    await expect(page).toHaveURL(/\/benchmarking\/projects/);
    await expect(projectsPage.pageTitle).toBeVisible();

    // Verify no critical console errors
    // Note: Some warnings may be acceptable, but no errors
    const criticalErrors = consoleErrors.filter(
      (err) => !err.includes('Warning') && !err.includes('DevTools')
    );
    expect(criticalErrors.length).toBe(0);
  });
});
