import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for the Artifact Viewer Drawer
 * Used for viewing benchmark run artifacts (JSON, images, text, etc.)
 */
export class ArtifactViewerDrawer {
  readonly page: Page;

  // Container
  readonly drawer: Locator;

  // Header
  readonly title: Locator;
  readonly artifactPath: Locator;

  // Metadata card
  readonly metadataCard: Locator;
  readonly artifactType: Locator;
  readonly mimeType: Locator;
  readonly sampleId: Locator;
  readonly nodeId: Locator;

  // Action buttons
  readonly downloadButton: Locator;
  readonly openMlflowButton: Locator;

  // Content viewers
  readonly contentCard: Locator;
  readonly loadingSpinner: Locator;
  readonly errorAlert: Locator;
  readonly imageViewer: Locator;
  readonly jsonViewer: Locator;
  readonly textViewer: Locator;
  readonly pdfAlert: Locator;
  readonly unsupportedAlert: Locator;

  constructor(page: Page) {
    this.page = page;

    // Container
    this.drawer = page.getByTestId('artifact-viewer-drawer');

    // Header
    this.title = page.getByTestId('artifact-viewer-title');
    this.artifactPath = page.getByTestId('artifact-path-display');

    // Metadata card
    this.metadataCard = page.getByTestId('artifact-metadata-card');
    this.artifactType = page.getByTestId('artifact-type-value');
    this.mimeType = page.getByTestId('artifact-mime-type-value');
    this.sampleId = page.getByTestId('artifact-sample-id-value');
    this.nodeId = page.getByTestId('artifact-node-id-value');

    // Action buttons
    this.downloadButton = page.getByTestId('download-artifact-btn');
    this.openMlflowButton = page.getByTestId('open-mlflow-btn');

    // Content viewers
    this.contentCard = page.getByTestId('artifact-content-card');
    this.loadingSpinner = page.getByTestId('artifact-loading-spinner');
    this.errorAlert = page.getByTestId('artifact-error-alert');
    this.imageViewer = page.getByTestId('artifact-image-viewer');
    this.jsonViewer = page.getByTestId('artifact-json-viewer');
    this.textViewer = page.getByTestId('artifact-text-viewer');
    this.pdfAlert = page.getByTestId('artifact-pdf-alert');
    this.unsupportedAlert = page.getByTestId('artifact-unsupported-alert');
  }

  /**
   * Wait for the drawer to be visible
   */
  async waitForDrawerToOpen() {
    await this.drawer.waitFor({ state: 'visible' });
  }

  /**
   * Close the drawer by clicking the close button
   */
  async close() {
    // Mantine Drawer has a close button with aria-label="Close drawer"
    await this.page.getByLabel('Close drawer').click();
  }

  /**
   * Download the artifact
   */
  async download() {
    await this.downloadButton.click();
  }

  /**
   * Open the artifact in MLflow (in a new tab)
   */
  async openInMlflow() {
    await this.openMlflowButton.click();
  }

  /**
   * Check if the JSON viewer is displayed
   */
  async isJsonViewerVisible(): Promise<boolean> {
    return await this.jsonViewer.isVisible();
  }

  /**
   * Check if the image viewer is displayed
   */
  async isImageViewerVisible(): Promise<boolean> {
    return await this.imageViewer.isVisible();
  }

  /**
   * Check if the text viewer is displayed
   */
  async isTextViewerVisible(): Promise<boolean> {
    return await this.textViewer.isVisible();
  }

  /**
   * Check if the unsupported alert is displayed
   */
  async isUnsupportedAlertVisible(): Promise<boolean> {
    return await this.unsupportedAlert.isVisible();
  }

  /**
   * Check if the error alert is displayed
   */
  async isErrorAlertVisible(): Promise<boolean> {
    return await this.errorAlert.isVisible();
  }

  /**
   * Get the displayed artifact type
   */
  async getArtifactType(): Promise<string> {
    return await this.artifactType.textContent() || '';
  }

  /**
   * Get the displayed MIME type
   */
  async getMimeType(): Promise<string> {
    return await this.mimeType.textContent() || '';
  }

  /**
   * Get the artifact path
   */
  async getArtifactPath(): Promise<string> {
    return await this.artifactPath.textContent() || '';
  }

  /**
   * Get the JSON content
   */
  async getJsonContent(): Promise<string> {
    // JsonInput is a textarea in Mantine
    return await this.jsonViewer.locator('textarea').inputValue();
  }

  /**
   * Get the text content
   */
  async getTextContent(): Promise<string> {
    return await this.textViewer.locator('textarea').inputValue();
  }
}
