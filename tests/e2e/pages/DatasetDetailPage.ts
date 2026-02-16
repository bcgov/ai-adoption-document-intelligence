import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for Dataset Detail page
 * /benchmarking/datasets/{datasetId}
 */
export class DatasetDetailPage {
  readonly page: Page;

  // Header elements
  readonly datasetNameTitle: Locator;
  readonly datasetDescription: Locator;
  readonly uploadFilesBtn: Locator;

  // Tabs
  readonly versionsTab: Locator;
  readonly samplePreviewTab: Locator;
  readonly splitsTab: Locator;

  // Versions table
  readonly versionsTable: Locator;
  readonly versionRows: Locator;
  readonly noVersionsMessage: Locator;

  // Samples table (in sample preview tab)
  readonly samplesTable: Locator;
  readonly sampleRows: Locator;
  readonly noSamplesMessage: Locator;
  readonly samplesPagination: Locator;

  // Loading state
  readonly loadingSpinner: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header
    this.datasetNameTitle = page.locator('[data-testid="dataset-name-title"]');
    this.datasetDescription = page.locator('[data-testid="dataset-description"]');
    this.uploadFilesBtn = page.locator('[data-testid="upload-files-btn"]');

    // Tabs
    this.versionsTab = page.locator('[data-testid="versions-tab"]');
    this.samplePreviewTab = page.locator('[data-testid="sample-preview-tab"]');
    this.splitsTab = page.locator('[data-testid="splits-tab"]');

    // Versions
    this.versionsTable = page.locator('[data-testid="versions-table"]');
    this.versionRows = page.locator('[data-testid^="version-row-"]');
    this.noVersionsMessage = page.locator('[data-testid="no-versions-message"]');

    // Samples
    this.samplesTable = page.locator('[data-testid="samples-table"]');
    this.sampleRows = page.locator('[data-testid^="sample-row-"]');
    this.noSamplesMessage = page.locator('[data-testid="no-samples-message"]');
    this.samplesPagination = page.locator('[data-testid="samples-pagination"]');

    // Loading
    this.loadingSpinner = page.locator('role=generic >> role=generic[name="Loader"]');
  }

  /**
   * Navigate to this page directly
   * @param datasetId - The ID of the dataset
   */
  async goto(datasetId: string) {
    await this.page.goto(`/benchmarking/datasets/${datasetId}`);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Click on a version row to view samples
   * @param versionId - The ID of the version to click
   */
  async clickVersion(versionId: string) {
    const row = this.page.locator(`[data-testid="version-row-${versionId}"]`);
    await row.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Switch to sample preview tab
   */
  async goToSamplePreviewTab() {
    await this.samplePreviewTab.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Switch to splits tab
   */
  async goToSplitsTab() {
    await this.splitsTab.click();
    await this.page.waitForLoadState('networkidle');
  }
}
