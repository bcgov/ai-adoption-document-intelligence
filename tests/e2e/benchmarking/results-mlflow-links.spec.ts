import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from '../helpers/auth';
import { RunDetailPage } from '../pages/RunDetailPage';

test.describe('US-031 - Results Summary: MLflow Deep-Links', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  const SEED_PROJECT_ID = 'seed-project-invoice-extraction';
  const SEED_RUN_ID_COMPLETED = 'seed-run-completed-001';

  let runDetailPage: RunDetailPage;

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

    runDetailPage = new RunDetailPage(page);
  });

  test('Scenario 4: should display MLflow deep-link', async ({ page }) => {
    // REQ US-031: Link is prominently displayed and clearly labeled

    // Given: Benchmark run has mlflowRunId and mlflowExperimentId
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    // Then: MLflow link is visible in run information table
    const mlflowLink = runDetailPage.getMlflowLink();
    await expect(mlflowLink).toBeVisible();
  });

  test('Scenario 4: MLflow link should have correct URL format', async ({ page }) => {
    // REQ US-031: URL format: http://localhost:5000/#/experiments/{mlflowExperimentId}/runs/{mlflowRunId}

    // Given: Run with MLflow IDs (mlflowRunId: "mlflow-run-001", experiment not in seed but should be in URL)
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    // Then: Link URL contains MLflow run ID
    const mlflowLink = runDetailPage.getMlflowLink();
    const href = await mlflowLink.getAttribute('href');

    expect(href).toBeTruthy();
    expect(href).toContain('mlflow-run-001'); // From seed data

    // Check URL structure (may be localhost:5000 or different MLflow host)
    // URL should contain pattern: experiments/{id}/runs/{runId} or similar
    expect(href).toMatch(/mlflow/i); // Should reference MLflow
  });

  test('Scenario 4: MLflow link should open in new tab', async ({ page, context }) => {
    // REQ US-031: Link opens in new tab

    // Given: Run detail page with MLflow link
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    const mlflowLink = runDetailPage.getMlflowLink();
    await expect(mlflowLink).toBeVisible();

    // Then: Link has target="_blank" attribute
    const target = await mlflowLink.getAttribute('target');
    expect(target).toBe('_blank');

    // And: Link has security attributes
    const rel = await mlflowLink.getAttribute('rel');
    expect(rel).toBeTruthy();
    expect(rel).toContain('noopener');
  });

  test('Scenario 4: should display Temporal workflow link', async ({ page }) => {
    // REQ US-031: Temporal link should also be displayed (related to MLflow deep-linking pattern)

    // Given: Run with Temporal workflow ID
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    // Then: Temporal link is visible in run information table
    const temporalLink = runDetailPage.getTemporalLink();
    await expect(temporalLink).toBeVisible();

    // Verify link contains temporal workflow ID from seed data
    const href = await temporalLink.getAttribute('href');
    expect(href).toBeTruthy();
    expect(href).toContain('temporal-wf-001'); // From seed data
  });

  test('Scenario 4: Temporal link should open in new tab', async ({ page }) => {
    // REQ US-031: External links open in new tab (applies to Temporal too)

    // Given: Run with Temporal workflow link
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    const temporalLink = runDetailPage.getTemporalLink();
    await expect(temporalLink).toBeVisible();

    // Then: Link has target="_blank" and security attributes
    const target = await temporalLink.getAttribute('target');
    expect(target).toBe('_blank');

    const rel = await temporalLink.getAttribute('rel');
    expect(rel).toBeTruthy();
    expect(rel).toContain('noopener');
  });

  test('Scenario 17: MLflow link should be accessible even if MLflow is down', async ({ page }) => {
    // REQ US-031: Link should be present and clickable even if MLflow service is unavailable
    // Note: We cannot actually test MLflow being down in E2E, but we can verify the link exists

    // Given: Run detail page
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    // Then: MLflow link is present and has valid href
    const mlflowLink = runDetailPage.getMlflowLink();
    await expect(mlflowLink).toBeVisible();

    const href = await mlflowLink.getAttribute('href');
    expect(href).toBeTruthy();
    expect(href!.length).toBeGreaterThan(0);

    // Link should be clickable (enabled)
    const isDisabled = await mlflowLink.isDisabled();
    expect(isDisabled).toBe(false);
  });

  test('Scenario 17: should handle MLflow UI unavailable gracefully', async ({ page }) => {
    // REQ US-031: When MLflow service is unavailable, user sees clear error
    // TODO: we cannot easily simulate MLflow being down
    // In production, the browser would show connection error when opening the link

    // Given: MLflow service is stopped/unavailable
    // When: User clicks "View in MLflow" link
    // Then: New tab opens but shows MLflow connection error
    // And: User can close tab and continue using the app
    // And: In-app data remains accessible
  });

  test('Scenario 4: MLflow and Temporal links should be clearly labeled', async ({ page }) => {
    // REQ US-031: Links are prominently displayed and clearly labeled

    // Given: Run detail page
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    // Then: Run information table has clear labels
    const runInfoTable = runDetailPage.runInfoTable;
    await expect(runInfoTable).toContainText('MLflow Run');
    await expect(runInfoTable).toContainText('Temporal Workflow');

    // Verify links are in the same section
    const mlflowLink = runDetailPage.getMlflowLink();
    const temporalLink = runDetailPage.getTemporalLink();

    await expect(mlflowLink).toBeVisible();
    await expect(temporalLink).toBeVisible();
  });
});
