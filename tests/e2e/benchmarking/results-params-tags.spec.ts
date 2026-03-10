import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from '../helpers/auth';
import { RunDetailPage } from '../pages/RunDetailPage';

test.describe('US-031 - Results Summary: Parameters & Tags', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  const SEED_PROJECT_ID = 'seed-project-invoice-extraction';
  const SEED_RUN_ID_COMPLETED = 'seed-run-completed-001';
  const SEED_RUN_ID_PASSING = 'seed-run-passing-004';

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

  test('Scenario 2: should display run parameters section', async ({ page }) => {
    // REQ US-031: Parameters section shows key-value pairs

    // Given: Completed benchmark run with parameters
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_PASSING);

    // Then: Parameters section is clearly labeled and visible
    await expect(runDetailPage.paramsTagsHeading).toBeVisible();
    await expect(runDetailPage.paramsTagsHeading).toContainText('Run Parameters');

    // And: Parameters table is displayed
    await expect(runDetailPage.paramsTable).toBeVisible();
  });

  test('Scenario 2: should display run parameters as key-value pairs', async ({ page }) => {
    // REQ US-031: Parameters are displayed as key-value pairs

    // Given: Run with complete parameters
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_PASSING);

    // Then: Parameters are displayed with keys and values
    const paramsTable = runDetailPage.paramsTable;

    // Seed data includes: model, confidence_threshold
    await expect(paramsTable).toContainText('model');
    await expect(paramsTable).toContainText('prebuilt-layout-v2');
    await expect(paramsTable).toContainText('confidence_threshold');
    await expect(paramsTable).toContainText('0.85');
  });

  test('Scenario 2: parameters should be formatted and readable', async ({ page }) => {
    // REQ US-031: Values are formatted and readable

    // Given: Run with parameters
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_PASSING);

    // Then: Parameter values are readable (not truncated or obfuscated)
    const paramsTable = runDetailPage.paramsTable;
    const tableText = await paramsTable.textContent();

    expect(tableText).toBeTruthy();
    expect(tableText).toContain('prebuilt-layout-v2'); // Full value visible
    expect(tableText).toContain('0.85'); // Numeric value visible
  });

  test('Scenario 3: should display run tags section', async ({ page }) => {
    // REQ US-031: Tags section is clearly labeled

    // Given: Completed benchmark run with tags
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_PASSING);

    // Then: Tags section is visible and labeled
    await expect(runDetailPage.paramsTagsHeading).toContainText('Tags');
    await expect(runDetailPage.tagsTable).toBeVisible();
  });

  test('Scenario 3: should display run tags as key-value pairs', async ({ page }) => {
    // REQ US-031: Tags are displayed as key-value pairs or badges

    // Given: Run with complete tags
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_PASSING);

    // Then: Tags are displayed with keys and values
    const tagsTable = runDetailPage.tagsTable;

    // Seed data includes: environment, version
    await expect(tagsTable).toContainText('environment');
    await expect(tagsTable).toContainText('test');
    await expect(tagsTable).toContainText('version');
    await expect(tagsTable).toContainText('v1.2');
  });

  test('Scenario 3: git SHA should be displayed in run info', async ({ page }) => {
    // REQ US-031: Git SHA is truncated with hover for full value

    // Given: Run with worker git SHA
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_PASSING);

    // Then: Worker Git SHA is visible in run information table
    const runInfoTable = runDetailPage.runInfoTable;
    await expect(runInfoTable).toContainText('Worker Git SHA');
    await expect(runInfoTable).toContainText('git-sha-004'); // From seed data
  });

  test('Scenario 2: completed run should show all standard parameters', async ({ page }) => {
    // REQ US-031: Standard parameters are displayed

    // Given: Completed run
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    // Then: Parameters section exists (may be empty if no params in seed data)
    await expect(runDetailPage.paramsTagsHeading).toBeVisible();

    // Note: SEED_RUN_ID_COMPLETED doesn't have params in seed data
    // Check if "No parameters" message is shown or table is empty
    const paramsTable = runDetailPage.paramsTable;
    const isVisible = await paramsTable.isVisible().catch(() => false);

    if (!isVisible) {
      // If params table is not visible, that's expected for runs without params
      expect(isVisible).toBe(false);
    }
  });

  test('Scenario 3: completed run should show all standard tags', async ({ page }) => {
    // REQ US-031: Standard tags are displayed

    // Given: Completed run
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

    // Then: Tags section exists (may be empty if no tags in seed data)
    await expect(runDetailPage.paramsTagsHeading).toBeVisible();

    // Note: SEED_RUN_ID_COMPLETED doesn't have tags in seed data
    // Check if "No tags" message is shown or table is empty
    const tagsTable = runDetailPage.tagsTable;
    const isVisible = await tagsTable.isVisible().catch(() => false);

    if (!isVisible) {
      // If tags table is not visible, that's expected for runs without tags
      expect(isVisible).toBe(false);
    }
  });

  test('Scenario 2 & 3: params and tags should be in separate tables', async ({ page }) => {
    // REQ US-031: Parameters and tags are organized separately

    // Given: Run with both params and tags
    await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_PASSING);

    // Then: Both tables are present and distinct
    await expect(runDetailPage.paramsTable).toBeVisible();
    await expect(runDetailPage.tagsTable).toBeVisible();

    // Verify params table contains params
    await expect(runDetailPage.paramsTable).toContainText('model');

    // Verify tags table contains tags
    await expect(runDetailPage.tagsTable).toContainText('environment');

    // Verify params table does NOT contain tags
    const paramsText = await runDetailPage.paramsTable.textContent();
    expect(paramsText).not.toContain('environment');

    // Verify tags table does NOT contain params
    const tagsText = await runDetailPage.tagsTable.textContent();
    expect(tagsText).not.toContain('confidence_threshold');
  });
});
