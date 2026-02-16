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

  // File upload dialog
  readonly uploadFilesDialog: Locator;
  readonly fileDropzone: Locator;
  readonly selectedFilesList: Locator;
  readonly uploadProgress: Locator;
  readonly uploadSuccessMessage: Locator;
  readonly uploadCancelBtn: Locator;
  readonly uploadSubmitBtn: Locator;

  // Ground truth viewer
  readonly groundTruthViewer: Locator;
  readonly groundTruthJson: Locator;

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

    // File upload
    this.uploadFilesDialog = page.locator('[data-testid="upload-files-dialog"]');
    this.fileDropzone = page.locator('[data-testid="file-dropzone"]');
    this.selectedFilesList = page.locator('[data-testid="selected-files-list"]');
    this.uploadProgress = page.locator('[data-testid="upload-progress"]');
    this.uploadSuccessMessage = page.locator('[data-testid="upload-success-message"]');
    this.uploadCancelBtn = page.locator('[data-testid="upload-cancel-btn"]');
    this.uploadSubmitBtn = page.locator('[data-testid="upload-submit-btn"]');

    // Ground truth viewer
    this.groundTruthViewer = page.locator('[data-testid="ground-truth-viewer"]');
    this.groundTruthJson = page.locator('[data-testid="ground-truth-json"]');

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

  /**
   * Get version status badge for a specific version
   * @param versionId - The ID of the version
   */
  getVersionStatusBadge(versionId: string): Locator {
    return this.page.locator(`[data-testid="version-status-badge-${versionId}"]`);
  }

  /**
   * Get version actions button for a specific version
   * @param versionId - The ID of the version
   */
  getVersionActionsBtn(versionId: string): Locator {
    return this.page.locator(`[data-testid="version-actions-btn-${versionId}"]`);
  }

  /**
   * Get a specific action menu item for a version
   * @param versionId - The ID of the version
   * @param action - The action name (view-samples, validate, publish, archive)
   */
  getVersionActionMenuItem(versionId: string, action: string): Locator {
    return this.page.locator(`[data-testid="${action}-menu-item-${versionId}"]`);
  }

  /**
   * Publish a draft version
   * @param versionId - The ID of the version to publish
   */
  async publishVersion(versionId: string) {
    await this.getVersionActionsBtn(versionId).click();
    const menuItem = this.getVersionActionMenuItem(versionId, 'publish');
    await menuItem.waitFor({ state: 'visible' });
    await menuItem.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Archive a published version
   * @param versionId - The ID of the version to archive
   */
  async archiveVersion(versionId: string) {
    await this.getVersionActionsBtn(versionId).click();
    const menuItem = this.getVersionActionMenuItem(versionId, 'archive');
    await menuItem.waitFor({ state: 'visible' });
    await menuItem.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Open the upload files dialog
   */
  async openUploadDialog() {
    await this.uploadFilesBtn.click();
    // Wait for the dropzone to be visible (Mantine modals have transitions)
    await this.fileDropzone.waitFor({ state: 'visible', timeout: 10000 });
  }

  /**
   * Get the view ground truth button for a specific sample
   * @param sampleId - The ID of the sample
   */
  getViewGroundTruthBtn(sampleId: string): Locator {
    return this.page.locator(`[data-testid="view-ground-truth-btn-${sampleId}"]`);
  }

  /**
   * View ground truth JSON for a sample
   * @param sampleId - The ID of the sample
   */
  async viewGroundTruth(sampleId: string) {
    await this.getViewGroundTruthBtn(sampleId).click();
    await this.groundTruthViewer.waitFor({ state: 'visible' });
  }

  /**
   * Get a file item in the upload dialog
   * @param index - The index of the file in the list
   */
  getFileItem(index: number): Locator {
    return this.page.locator(`[data-testid="file-item-${index}"]`);
  }

  /**
   * Get the remove file button for a specific file
   * @param index - The index of the file in the list
   */
  getRemoveFileBtn(index: number): Locator {
    return this.page.locator(`[data-testid="remove-file-btn-${index}"]`);
  }

  /**
   * Upload files via the file picker
   * @param filePaths - Array of absolute file paths to upload
   */
  async uploadFiles(filePaths: string[]) {
    // Open upload dialog
    await this.openUploadDialog();

    // Set files to the input element
    const fileInput = this.fileDropzone.locator('input[type="file"]');
    await fileInput.setInputFiles(filePaths);

    // Wait for files to appear in list
    await this.selectedFilesList.waitFor({ state: 'visible' });

    // Click upload button
    await this.uploadSubmitBtn.click();

    // Wait for upload to complete
    await this.uploadSuccessMessage.waitFor({ state: 'visible' });
  }
}
