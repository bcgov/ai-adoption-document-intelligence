import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for Sidebar Navigation
 * Handles navigation to all application sections including benchmarking
 */
export class SidebarNavigationPage {
  readonly page: Page;

  // Sidebar controls
  readonly sidebarToggle: Locator;

  // Benchmarking navigation
  readonly benchmarkingNavParent: Locator;
  readonly benchmarkingNavCollapsed: Locator;
  readonly datasetsNavLink: Locator;
  readonly projectsNavLink: Locator;
  readonly runsNavLink: Locator;

  // Other navigation items
  readonly uploadNav: Locator;
  readonly queueNav: Locator;
  readonly labelingNav: Locator;
  readonly reviewNav: Locator;
  readonly workflowsNav: Locator;
  readonly settingsNav: Locator;

  // Header elements
  readonly logoutButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Sidebar controls
    this.sidebarToggle = page.locator('[data-testid="sidebar-toggle-btn"]');

    // Benchmarking navigation
    this.benchmarkingNavParent = page.locator('[data-testid="benchmarking-nav"]');
    this.benchmarkingNavCollapsed = page.locator('[data-testid="benchmarking-nav-collapsed"]');
    this.datasetsNavLink = page.locator('[data-testid="datasets-nav-link"]');
    this.projectsNavLink = page.locator('[data-testid="projects-nav-link"]');
    this.runsNavLink = page.locator('[data-testid="runs-nav-link"]');

    // Other navigation items
    this.uploadNav = page.getByText('Upload').first();
    this.queueNav = page.getByText('Processing queue').first();
    this.labelingNav = page.getByText('Training Labels').first();
    this.reviewNav = page.getByText('HITL Review').first();
    this.workflowsNav = page.getByText('Workflows').first();
    this.settingsNav = page.getByText('Settings').first();

    // Header elements
    this.logoutButton = page.locator('[data-testid="logout-btn"]');
  }

  /**
   * Expand benchmarking section if it's collapsed
   */
  async expandBenchmarkingSection() {
    // Check if the sub-items are already visible
    const isVisible = await this.datasetsNavLink.isVisible();
    if (!isVisible) {
      // Click on the benchmarking parent to expand
      await this.benchmarkingNavParent.click();
      // Wait for sub-items to be visible
      await this.datasetsNavLink.waitFor({ state: 'visible' });
    }
  }

  /**
   * Navigate to Datasets page
   */
  async navigateToDatasets() {
    await this.expandBenchmarkingSection();
    await this.datasetsNavLink.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Navigate to Projects page
   */
  async navigateToProjects() {
    await this.expandBenchmarkingSection();
    await this.projectsNavLink.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Navigate to Runs page
   */
  async navigateToRuns() {
    await this.expandBenchmarkingSection();
    await this.runsNavLink.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Toggle sidebar collapse/expand
   */
  async toggleSidebar() {
    await this.sidebarToggle.click();
  }

  /**
   * Verify benchmarking section is visible with all sub-items
   */
  async verifyBenchmarkingSectionVisible() {
    await this.benchmarkingNavParent.waitFor({ state: 'visible' });
    await this.datasetsNavLink.waitFor({ state: 'visible' });
    await this.projectsNavLink.waitFor({ state: 'visible' });
    await this.runsNavLink.waitFor({ state: 'visible' });
  }
}
