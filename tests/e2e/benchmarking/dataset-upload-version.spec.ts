import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from '../helpers/auth';
import { DatasetDetailPage } from '../pages/DatasetDetailPage';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

/**
 * Test Plan: Dataset Upload & Version Creation E2E
 * Tests the full flow: create dataset → upload files → create version → verify version appears
 *
 * Serial mode: tests share a dataset created in the first test
 */
test.describe.configure({ mode: 'serial' });

test.describe('Dataset Upload & Version Creation', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  let datasetPage: DatasetDetailPage;
  let createdDatasetId: string;
  let tempFilesDir: string;

  test.beforeAll(async () => {
    if (!TEST_API_KEY) {
      throw new Error('TEST_API_KEY environment variable is not set');
    }

    // Create temp directory with test files for upload
    tempFilesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-upload-'));

    // Create a sample input file (PDF-like, but just a small text file for testing)
    fs.writeFileSync(
      path.join(tempFilesDir, 'sample-001.pdf'),
      Buffer.from('%PDF-1.4 test content for sample 001'),
    );

    fs.writeFileSync(
      path.join(tempFilesDir, 'sample-002.pdf'),
      Buffer.from('%PDF-1.4 test content for sample 002'),
    );

    // Create a ground truth JSON file
    fs.writeFileSync(
      path.join(tempFilesDir, 'sample-001.json'),
      JSON.stringify({ invoice_number: 'INV-001', total: 100.0 }),
    );
  });

  test.afterAll(async () => {
    // Clean up temp files
    if (tempFilesDir && fs.existsSync(tempFilesDir)) {
      fs.rmSync(tempFilesDir, { recursive: true, force: true });
    }
  });

  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedTest(page, {
      apiKey: TEST_API_KEY!,
      backendUrl: BACKEND_URL,
      frontendUrl: FRONTEND_URL,
    });

    datasetPage = new DatasetDetailPage(page);
  });

  test('should create a dataset via API for upload testing', async ({ request }) => {
    // Create dataset via API with a unique local path
    const uniquePath = `/tmp/e2e-dataset-upload-${Date.now()}`;

    const response = await request.post(`${BACKEND_URL}/api/benchmark/datasets`, {
      headers: {
        'x-api-key': TEST_API_KEY!,
        'Content-Type': 'application/json',
      },
      data: {
        name: `Upload Test Dataset ${Date.now()}`,
        description: 'E2E test for file upload and version creation',
        repositoryUrl: uniquePath,
      },
    });

    expect(response.ok()).toBeTruthy();
    const dataset = await response.json();
    createdDatasetId = dataset.id;
    expect(createdDatasetId).toBeTruthy();
  });

  test('should show empty versions state on new dataset detail page', async ({ page }) => {
    expect(createdDatasetId).toBeTruthy();

    // Navigate to the newly created dataset
    await datasetPage.goto(createdDatasetId);

    // Should show "No versions yet" message
    await expect(datasetPage.noVersionsMessage).toBeVisible();
    await expect(page.getByText('Upload files to create a new version')).toBeVisible();

    // Upload button should be visible
    await expect(datasetPage.uploadFilesBtn).toBeVisible();
  });

  test('should open upload dialog and select files', async ({ page }) => {
    await datasetPage.goto(createdDatasetId);

    // Open the upload dialog
    await datasetPage.openUploadDialog();

    // Verify dialog elements are visible
    await expect(datasetPage.fileDropzone).toBeVisible();
    await expect(datasetPage.uploadCancelBtn).toBeVisible();
    await expect(datasetPage.uploadSubmitBtn).toBeVisible();

    // Upload button should be disabled when no files selected
    await expect(datasetPage.uploadSubmitBtn).toBeDisabled();

    // Select files via file input
    const fileInput = datasetPage.fileDropzone.locator('input[type="file"]');
    await fileInput.setInputFiles([
      path.join(tempFilesDir, 'sample-001.pdf'),
      path.join(tempFilesDir, 'sample-002.pdf'),
    ]);

    // Verify files appear in the selected files list
    await expect(datasetPage.selectedFilesList).toBeVisible();
    await expect(page.getByText('sample-001.pdf')).toBeVisible();
    await expect(page.getByText('sample-002.pdf')).toBeVisible();

    // Upload button should now be enabled
    await expect(datasetPage.uploadSubmitBtn).toBeEnabled();
  });

  test('should remove a selected file before uploading', async ({ page }) => {
    await datasetPage.goto(createdDatasetId);
    await datasetPage.openUploadDialog();

    // Select files
    const fileInput = datasetPage.fileDropzone.locator('input[type="file"]');
    await fileInput.setInputFiles([
      path.join(tempFilesDir, 'sample-001.pdf'),
      path.join(tempFilesDir, 'sample-002.pdf'),
    ]);

    // Verify both files are listed
    await expect(datasetPage.selectedFilesList).toBeVisible();
    await expect(page.getByText('Selected Files (2)')).toBeVisible();

    // Remove the first file
    await datasetPage.getRemoveFileBtn(0).click();

    // Verify only one file remains
    await expect(page.getByText('Selected Files (1)')).toBeVisible();
  });

  test('should upload files successfully', async ({ page }) => {
    await datasetPage.goto(createdDatasetId);
    await datasetPage.openUploadDialog();

    // Select input and ground truth files
    const fileInput = datasetPage.fileDropzone.locator('input[type="file"]');
    await fileInput.setInputFiles([
      path.join(tempFilesDir, 'sample-001.pdf'),
      path.join(tempFilesDir, 'sample-002.pdf'),
      path.join(tempFilesDir, 'sample-001.json'),
    ]);

    // Verify files are listed
    await expect(datasetPage.selectedFilesList).toBeVisible();

    // Click upload
    await datasetPage.uploadSubmitBtn.click();

    // Wait for success message
    await expect(datasetPage.uploadSuccessMessage).toBeVisible({ timeout: 30000 });
    await expect(datasetPage.uploadSuccessMessage).toContainText('Files uploaded successfully');

    // Upload button should be hidden after success, close button visible
    await expect(datasetPage.uploadSubmitBtn).not.toBeVisible();
    await expect(datasetPage.uploadCancelBtn).toBeVisible();
    await expect(datasetPage.uploadCancelBtn).toContainText('Close');
  });

  test('should display auto-created version in the versions table after upload', async ({ page }) => {
    await datasetPage.goto(createdDatasetId);

    // The "No versions yet" message should no longer be visible (upload auto-created a version)
    await expect(datasetPage.noVersionsMessage).not.toBeVisible();

    // Versions table should be visible with the auto-created version
    await expect(datasetPage.versionsTable).toBeVisible();
    await expect(datasetPage.versionRows).toHaveCount(1);

    // Verify version details - auto-created as v1 with draft status
    const versionRow = datasetPage.versionRows.first();
    await expect(versionRow).toContainText('v1');
    await expect(versionRow).toContainText('draft');
  });

  test('should close upload dialog and return to dataset page', async ({ page }) => {
    await datasetPage.goto(createdDatasetId);
    await datasetPage.openUploadDialog();

    // Cancel without uploading
    await datasetPage.uploadCancelBtn.click();

    // Dialog should close
    await expect(datasetPage.fileDropzone).not.toBeVisible();

    // Dataset page should still be visible
    await expect(datasetPage.versionsTable).toBeVisible();
  });

  test('should clean up test dataset', async ({ request }) => {
    // Delete the test dataset
    if (createdDatasetId) {
      const response = await request.delete(
        `${BACKEND_URL}/api/benchmark/datasets/${createdDatasetId}`,
        {
          headers: { 'x-api-key': TEST_API_KEY! },
        },
      );
      expect(response.ok()).toBeTruthy();
    }
  });
});
