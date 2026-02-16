import { test, expect, Page } from '@playwright/test';
import { setupAuthenticatedTest } from '../helpers/auth';
import { RunDetailPage } from '../pages/RunDetailPage';
import { ArtifactViewerDrawer } from '../pages/ArtifactViewerDrawer';

/**
 * E2E Tests for US-039: In-App Artifact Viewer
 *
 * Tests cover viewing different artifact types (JSON, image, text, unsupported),
 * downloading artifacts, and opening artifacts in MLflow.
 *
 * NOTE: These tests focus on currently implemented features only.
 * Unimplemented features (PDF viewer, diff viewer, zoom/pan, etc.) are not tested.
 *
 * Requirements: feature-docs/003-benchmarking-system/user-stories/US-039-in-app-artifact-viewer.md
 */

test.describe('Artifact Viewer - Basic Viewing', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  let runDetailPage: RunDetailPage;
  let artifactViewer: ArtifactViewerDrawer;

  // Seed data IDs
  const PROJECT_ID = 'seed-project-invoice-extraction';
  // Use the passing run which has baseline comparison but won't crash the page
  // Note: The completed run (001) is the baseline itself and doesn't have baseline comparison
  const RUN_ID = 'seed-run-passing-004';

  test.beforeAll(() => {
    if (!TEST_API_KEY) {
      throw new Error('TEST_API_KEY environment variable is not set');
    }
  });

  test.beforeEach(async ({ page }) => {
    // REQ-039: Setup authentication
    await setupAuthenticatedTest(page, {
      apiKey: TEST_API_KEY!,
      backendUrl: BACKEND_URL,
      frontendUrl: FRONTEND_URL,
    });

    // Mock artifact content responses since we don't have actual MinIO files
    await page.route('**/artifacts/*/content', async (route, request) => {
      const url = request.url();

      // JSON artifact
      if (url.includes('seed-artifact-json-001')) {
        const jsonContent = JSON.stringify({
          evaluationId: 'eval-001',
          runId: RUN_ID,
          metrics: {
            field_accuracy: 0.95,
            character_accuracy: 0.98,
            word_accuracy: 0.96,
          },
          perFieldResults: [
            { fieldName: 'invoice_number', accuracy: 0.92, errorCount: 4 },
            { fieldName: 'total_amount', accuracy: 0.97, errorCount: 2 },
          ],
          timestamp: '2026-02-10T10:45:00Z',
        }, null, 2);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: jsonContent,
        });
      }
      // Image artifact (1x1 red pixel PNG)
      else if (url.includes('seed-artifact-image-001')) {
        const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
        const buffer = Buffer.from(pngBase64, 'base64');
        await route.fulfill({
          status: 200,
          contentType: 'image/png',
          body: buffer,
        });
      }
      // Text artifact
      else if (url.includes('seed-artifact-text-001')) {
        const textContent = `[2026-02-10 10:30:15] INFO: Starting evaluation for run ${RUN_ID}
[2026-02-10 10:30:16] INFO: Loading dataset version seed-dataset-version-v1.0
[2026-02-10 10:30:17] INFO: Processing sample-001
[2026-02-10 10:30:19] WARN: Low confidence score for field 'invoice_number' in sample-003
[2026-02-10 10:30:21] ERROR: Field extraction failed for 'vendor_name' in sample-005
[2026-02-10 10:45:00] INFO: Evaluation completed successfully`;
        await route.fulfill({
          status: 200,
          contentType: 'text/plain',
          body: textContent,
        });
      }
      // Unsupported artifact
      else if (url.includes('seed-artifact-unsupported-001')) {
        const buffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        await route.fulfill({
          status: 200,
          contentType: 'application/octet-stream',
          body: buffer,
        });
      }
      else {
        // Default: continue with actual request
        await route.continue();
      }
    });

    runDetailPage = new RunDetailPage(page);
    artifactViewer = new ArtifactViewerDrawer(page);

    // Navigate to run detail page
    await page.goto(`/benchmarking/projects/${PROJECT_ID}/runs/${RUN_ID}`);
    await page.waitForLoadState('networkidle');
  });

  test('Scenario 1: Open JSON Artifact Viewer', async ({ page }) => {
    // REQ-039-S1: View JSON artifacts with syntax highlighting and formatting

    // Given: Artifact list contains a JSON artifact
    await expect(runDetailPage.artifactsTable).toBeVisible();

    // Find and click the JSON artifact row
    // The seed data creates an artifact with type "evaluation_report" and mimeType "application/json"
    const jsonRow = page.locator('[data-testid^="artifact-row-"]').filter({
      has: page.locator('text="evaluation_report"'),
    });
    await expect(jsonRow).toBeVisible();

    // When: User clicks on the JSON artifact
    await jsonRow.click();

    // Then: JSON viewer drawer opens
    await artifactViewer.waitForDrawerToOpen();
    await expect(artifactViewer.title).toHaveText('Artifact Viewer');

    // Then: JSON content is displayed with syntax highlighting
    await expect(artifactViewer.jsonViewer).toBeVisible();

    // Then: JSON is formatted and indented
    const jsonContent = await artifactViewer.getJsonContent();
    expect(jsonContent).toContain('evaluationId');
    expect(jsonContent).toContain('metrics');
    expect(jsonContent).toContain('field_accuracy');

    // Verify it's properly formatted (has indentation)
    expect(jsonContent).toContain('\n');
    expect(jsonContent).toMatch(/\s+"field_accuracy"/); // Check for indentation

    // Then: Viewer is read-only (JsonInput component is readonly by default)
    // Note: jsonViewer IS the textarea element (Mantine JsonInput renders as textarea)
    await expect(artifactViewer.jsonViewer).toHaveAttribute('readonly');
  });

  test('Scenario 2: View JSON Artifact Metadata', async ({ page }) => {
    // REQ-039-S1: Verify artifact metadata is displayed correctly

    // Given: User opens a JSON artifact
    const jsonRow = page.locator('[data-testid^="artifact-row-"]').filter({
      has: page.locator('text="evaluation_report"'),
    });
    await jsonRow.click();
    await artifactViewer.waitForDrawerToOpen();

    // Then: Artifact metadata is displayed
    await expect(artifactViewer.metadataCard).toBeVisible();

    // Then: Type is shown
    const type = await artifactViewer.getArtifactType();
    expect(type).toBe('evaluation_report');

    // Then: MIME type is shown
    const mimeType = await artifactViewer.getMimeType();
    expect(mimeType).toBe('application/json');

    // Then: Artifact path is shown
    const path = await artifactViewer.getArtifactPath();
    expect(path).toContain('evaluation_report');
    expect(path).toContain('.json');
  });

  test('Scenario 3: View Image Artifact', async ({ page }) => {
    // REQ-039-S2: View image artifacts (basic display, no zoom/pan)

    // Given: Artifact list contains an image artifact
    await expect(runDetailPage.artifactsTable).toBeVisible();

    // Find and click the image artifact row
    // The seed data creates an artifact with type "per_doc_output" and mimeType "image/png"
    const imageRow = page.locator('[data-testid^="artifact-row-"]').filter({
      has: page.locator('text="per_doc_output"'),
    });
    await expect(imageRow).toBeVisible();

    // When: User clicks on the image artifact
    await imageRow.click();

    // Then: Image viewer drawer opens
    await artifactViewer.waitForDrawerToOpen();

    // Then: Image is displayed
    await expect(artifactViewer.imageViewer).toBeVisible();

    // Then: Image has proper attributes
    await expect(artifactViewer.imageViewer).toHaveAttribute('alt');

    // Then: Metadata shows image type
    const type = await artifactViewer.getArtifactType();
    expect(type).toBe('per_doc_output');

    const mimeType = await artifactViewer.getMimeType();
    expect(mimeType).toBe('image/png');

    // Then: Sample ID and Node ID are shown (from seed data)
    await expect(artifactViewer.sampleId).toBeVisible();
    await expect(artifactViewer.sampleId).toHaveText('sample-001');

    await expect(artifactViewer.nodeId).toBeVisible();
    await expect(artifactViewer.nodeId).toHaveText('ocr-node');
  });

  test('Scenario 4: View Text Artifact', async ({ page }) => {
    // REQ-039-S4: View text artifacts (basic display, no line numbers)

    // Given: Artifact list contains a text artifact
    await expect(runDetailPage.artifactsTable).toBeVisible();

    // Find and click the text artifact row
    // The seed data creates an artifact with type "error_log" and mimeType "text/plain"
    const textRow = page.locator('[data-testid^="artifact-row-"]').filter({
      has: page.locator('text="error_log"'),
    });
    await expect(textRow).toBeVisible();

    // When: User clicks on the text artifact
    await textRow.click();

    // Then: Text viewer drawer opens
    await artifactViewer.waitForDrawerToOpen();

    // Then: Text content is displayed
    await expect(artifactViewer.textViewer).toBeVisible();

    // Then: Text content contains expected log entries
    const textContent = await artifactViewer.getTextContent();
    expect(textContent).toContain('INFO');
    expect(textContent).toContain('Starting evaluation');
    expect(textContent).toContain('WARN');
    expect(textContent).toContain('ERROR');

    // Then: Textarea is read-only
    // Note: textViewer IS the textarea element (Mantine Textarea)
    await expect(artifactViewer.textViewer).toHaveAttribute('readonly');

    // Then: Metadata shows text type
    const mimeType = await artifactViewer.getMimeType();
    expect(mimeType).toBe('text/plain');
  });

  test('Scenario 5: View Unsupported Artifact Type', async ({ page }) => {
    // REQ-039-S13: Unsupported file types show appropriate message

    // Given: Artifact list contains an unsupported artifact
    await expect(runDetailPage.artifactsTable).toBeVisible();

    // Find and click the unsupported artifact row
    // The seed data creates an artifact with type "intermediate_node_output" and mimeType "application/octet-stream"
    const unsupportedRow = page.locator('[data-testid^="artifact-row-"]').filter({
      has: page.locator('text="intermediate_node_output"'),
    });
    await expect(unsupportedRow).toBeVisible();

    // When: User clicks on the unsupported artifact
    await unsupportedRow.click();

    // Then: Viewer opens but shows unsupported message
    await artifactViewer.waitForDrawerToOpen();

    // Then: Unsupported alert is displayed
    await expect(artifactViewer.unsupportedAlert).toBeVisible();
    await expect(artifactViewer.unsupportedAlert).toContainText(
      'Preview Not Available'
    );
    await expect(artifactViewer.unsupportedAlert).toContainText(
      'This artifact type cannot be previewed in the browser'
    );

    // Then: Download button is available
    await expect(artifactViewer.downloadButton).toBeVisible();
  });

  test('Scenario 6: Close Artifact Viewer', async ({ page }) => {
    // REQ-039-S15: Close artifact viewer modal

    // Given: Artifact viewer is open
    const jsonRow = page.locator('[data-testid^="artifact-row-"]').first();
    await jsonRow.click();
    await artifactViewer.waitForDrawerToOpen();

    // When: User clicks close button
    await artifactViewer.close();

    // Then: Drawer closes
    await expect(artifactViewer.drawer).not.toBeVisible();

    // Then: User returns to run detail page
    await expect(runDetailPage.artifactsTable).toBeVisible();
  });
});

test.describe('Artifact Viewer - Actions', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  let runDetailPage: RunDetailPage;
  let artifactViewer: ArtifactViewerDrawer;

  const PROJECT_ID = 'seed-project-invoice-extraction';
  const RUN_ID = 'seed-run-passing-004';

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

    // Mock artifact content responses
    await page.route('**/artifacts/*/content', async (route, request) => {
      const url = request.url();
      if (url.includes('seed-artifact')) {
        const jsonContent = JSON.stringify({ test: 'data' }, null, 2);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: jsonContent,
        });
      } else {
        await route.continue();
      }
    });

    runDetailPage = new RunDetailPage(page);
    artifactViewer = new ArtifactViewerDrawer(page);

    await page.goto(`/benchmarking/projects/${PROJECT_ID}/runs/${RUN_ID}`);
    await page.waitForLoadState('networkidle');
  });

  test('Scenario 7: Download Artifact Button Exists', async ({ page }) => {
    // REQ-039-S7: Download artifact functionality

    // Given: Artifact viewer is open
    const jsonRow = page.locator('[data-testid^="artifact-row-"]').first();
    await jsonRow.click();
    await artifactViewer.waitForDrawerToOpen();

    // Then: Download button is visible
    await expect(artifactViewer.downloadButton).toBeVisible();
    await expect(artifactViewer.downloadButton).toContainText('Download');

    // Note: Actual download testing is complex in Playwright and requires
    // special handling of the download event. This test verifies the button exists.
    // Full download testing would be done with:
    // const [download] = await Promise.all([
    //   page.waitForEvent('download'),
    //   artifactViewer.downloadButton.click(),
    // ]);
  });

  test('Scenario 8: MLflow Deep-Link Button', async ({ page }) => {
    // REQ-039-S6: Deep-links to MLflow artifacts

    // Given: Artifact viewer is open for a run with MLflow data
    const jsonRow = page.locator('[data-testid^="artifact-row-"]').first();
    await jsonRow.click();
    await artifactViewer.waitForDrawerToOpen();

    // Then: MLflow button is visible (run has mlflowExperimentId and mlflowRunId)
    await expect(artifactViewer.openMlflowButton).toBeVisible();
    await expect(artifactViewer.openMlflowButton).toContainText('Open in MLflow');

    // Then: Button has correct link attributes
    await expect(artifactViewer.openMlflowButton).toHaveAttribute('target', '_blank');
    await expect(artifactViewer.openMlflowButton).toHaveAttribute('rel', 'noopener noreferrer');

    // Then: Link contains MLflow URL format
    const href = await artifactViewer.openMlflowButton.getAttribute('href');
    expect(href).toContain('experiments');
    expect(href).toContain('runs');
    expect(href).toContain('artifacts');
  });
});

test.describe('Artifact Viewer - Error Handling', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  let runDetailPage: RunDetailPage;
  let artifactViewer: ArtifactViewerDrawer;

  const PROJECT_ID = 'seed-project-invoice-extraction';
  const RUN_ID = 'seed-run-passing-004';

  test.beforeAll(() => {
    if (!TEST_API_KEY) {
      throw new Error('TEST_API_KEY environment variable is not set');
    }
  });

  test('Scenario 9: Artifact Loading Error', async ({ page }) => {
    // REQ-039-S18: Handle artifact fetch errors gracefully

    // Setup authentication and page
    await setupAuthenticatedTest(page, {
      apiKey: TEST_API_KEY!,
      backendUrl: BACKEND_URL,
      frontendUrl: FRONTEND_URL,
    });

    // Mock artifact content API to return a 500 error - only for content endpoint
    let contentRequested = false;
    await page.route('**/artifacts/*/content', async (route) => {
      contentRequested = true;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    runDetailPage = new RunDetailPage(page);
    artifactViewer = new ArtifactViewerDrawer(page);

    await page.goto(`/benchmarking/projects/${PROJECT_ID}/runs/${RUN_ID}`);
    await page.waitForLoadState('networkidle');

    // Given: Artifact list is displayed
    await expect(runDetailPage.artifactsTable).toBeVisible();

    // Wait for artifact rows to appear
    await page.waitForSelector('[data-testid^="artifact-row-"]', { timeout: 10000 });

    // When: User clicks on a JSON artifact (which will trigger content fetch)
    const jsonRow = page.locator('[data-testid^="artifact-row-"]').filter({
      has: page.locator('text="evaluation_report"'),
    });
    await jsonRow.click();

    // Then: Drawer opens
    await artifactViewer.waitForDrawerToOpen();

    // Then: Content request was made and error alert is displayed
    expect(contentRequested).toBe(true);
    await expect(artifactViewer.errorAlert).toBeVisible();
    await expect(artifactViewer.errorAlert).toContainText('Error Loading Artifact');
  });

  test('Scenario 10: Non-Existent Artifact Handling', async ({ page }) => {
    // Test that attempting to view a deleted or non-existent artifact shows an error

    // Setup authentication and page
    await setupAuthenticatedTest(page, {
      apiKey: TEST_API_KEY!,
      backendUrl: BACKEND_URL,
      frontendUrl: FRONTEND_URL,
    });

    // Mock artifact content API to return a 404 error - only for content endpoint
    let contentRequested = false;
    await page.route('**/artifacts/*/content', async (route) => {
      contentRequested = true;
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Artifact not found' }),
      });
    });

    runDetailPage = new RunDetailPage(page);
    artifactViewer = new ArtifactViewerDrawer(page);

    await page.goto(`/benchmarking/projects/${PROJECT_ID}/runs/${RUN_ID}`);
    await page.waitForLoadState('networkidle');

    // Given: Artifact list is displayed
    await expect(runDetailPage.artifactsTable).toBeVisible();

    // Wait for artifact rows to appear
    await page.waitForSelector('[data-testid^="artifact-row-"]', { timeout: 10000 });

    // When: User clicks on a JSON artifact (which will trigger content fetch)
    const jsonRow = page.locator('[data-testid^="artifact-row-"]').filter({
      has: page.locator('text="evaluation_report"'),
    });
    await jsonRow.click();

    // Then: Drawer opens
    await artifactViewer.waitForDrawerToOpen();

    // Then: Content request was made and error alert is displayed
    expect(contentRequested).toBe(true);
    await expect(artifactViewer.errorAlert).toBeVisible();
    await expect(artifactViewer.errorAlert).toContainText('Error Loading Artifact');
  });
});
