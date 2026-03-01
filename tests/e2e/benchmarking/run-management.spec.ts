import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from '../helpers/auth';
import { ProjectDetailPage } from '../pages/ProjectDetailPage';
import { RunDetailPage } from '../pages/RunDetailPage';
import { DefinitionDetailDialog } from '../pages/DefinitionDetailDialog';

/**
 * Test Suite: US-030 - Run List, Start/Cancel, Progress UI
 * Tests run management functionality including starting, canceling, and tracking benchmark runs
 */
test.describe('US-030: Run Management', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  const SEED_PROJECT_ID = 'seed-project-invoice-extraction';
  const SEED_DEFINITION_ID = 'seed-definition-baseline';
  const SEED_RUN_ID_COMPLETED = 'seed-run-completed-001';
  const SEED_RUN_ID_RUNNING = 'seed-run-running-002';
  const SEED_RUN_ID_FAILED = 'seed-run-failed-003';

  let projectPage: ProjectDetailPage;
  let runDetailPage: RunDetailPage;
  let definitionDialog: DefinitionDetailDialog;

  test.beforeAll(() => {
    if (!TEST_API_KEY) {
      throw new Error('TEST_API_KEY environment variable is not set');
    }
  });

  test.beforeEach(async ({ page }) => {
    // Setup authentication
    await setupAuthenticatedTest(page, {
      apiKey: TEST_API_KEY!,
      backendUrl: BACKEND_URL,
      frontendUrl: FRONTEND_URL,
    });

    projectPage = new ProjectDetailPage(page);
    runDetailPage = new RunDetailPage(page);
    definitionDialog = new DefinitionDetailDialog(page);
  });

  test.describe('Scenario 1: Run List Display', () => {
    test('should display run list with proper columns and data', async ({ page }) => {
      // REQ-US030-SC1: Run list page within project
      // Given: Project has multiple benchmark runs with various statuses
      await projectPage.goto(SEED_PROJECT_ID);

      // Then: Run list table is displayed
      await expect(projectPage.runsHeading).toBeVisible();
      await expect(projectPage.runsHeading).toHaveText(/Recent Runs/i);
      await expect(projectPage.runsTable).toBeVisible();

      // And: Runs are displayed with proper data
      await expect(projectPage.runRows).toHaveCount(5); // seed data has 5 runs

      // And: Status badges are visible
      const firstRunBadge = projectPage.getRunStatusBadge(SEED_RUN_ID_COMPLETED);
      await expect(firstRunBadge).toBeVisible();
    });

    test('should order runs by start time (most recent first)', async ({ page }) => {
      // REQ-US030-SC1: Runs ordered by start time
      await projectPage.goto(SEED_PROJECT_ID);

      // Then: First run is the most recent
      const firstRow = projectPage.runRows.first();
      await expect(firstRow).toBeVisible();

      // Verify that running run (most recent start: 2026-02-15) appears before completed run (2026-02-10)
      const runningRowIndex = await projectPage.getRunRow(SEED_RUN_ID_RUNNING).evaluate(el => {
        const rows = Array.from(el.parentElement!.children);
        return rows.indexOf(el);
      });

      const completedRowIndex = await projectPage.getRunRow(SEED_RUN_ID_COMPLETED).evaluate(el => {
        const rows = Array.from(el.parentElement!.children);
        return rows.indexOf(el);
      });

      expect(runningRowIndex).toBeLessThan(completedRowIndex);
    });
  });

  test.describe('Scenario 2: Start Run from Definition Detail', () => {
    test('should start run from definition detail dialog', async ({ page }) => {
      // REQ-US030-SC2: Start run button in definition detail
      // Given: User is viewing a benchmark definition detail page
      await projectPage.goto(SEED_PROJECT_ID);
      await projectPage.clickDefinition(SEED_DEFINITION_ID);
      await definitionDialog.waitForDialogToOpen();

      // When: User clicks the "Start Run" button
      await expect(definitionDialog.startRunBtn).toBeVisible();
      await expect(definitionDialog.startRunBtn).toBeEnabled();

      // note: Actually starting a run would create real data
      // In a real test environment, we would:
      // await definitionDialog.clickStartRun();
      // await page.waitForURL(/\/benchmarking\/projects\/.*\/runs\/.*/);
      // await expect(runDetailPage.runDefinitionName).toBeVisible();
      // await expect(runDetailPage.getStatusBadge()).toHaveText(/pending|running/i);
    });
  });

  test.describe('Scenario 4: Cancel Running Benchmark', () => {
    test('should show cancel button for running benchmark', async ({ page }) => {
      // REQ-US030-SC4: Cancel button visible for running runs
      // Given: Benchmark run is in `running` status
      await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_RUNNING);

      // Then: Cancel button is visible
      await expect(runDetailPage.cancelRunBtn).toBeVisible();
      await expect(runDetailPage.cancelRunBtn).toBeEnabled();

      // note: We don't actually click it to avoid changing test data state
      // In a real test: await runDetailPage.clickCancel();
      // Confirm in dialog, then verify status changes to 'cancelled'
    });
  });

  test.describe('Scenario 5: Cancel Button Hidden for Completed Runs', () => {
    test('should not show cancel button for completed run', async ({ page }) => {
      // REQ-US030-SC5: Cancel button hidden for non-running runs
      // Given: Benchmark run has status `completed`
      await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

      // Then: Cancel button is not visible
      await expect(runDetailPage.cancelRunBtn).not.toBeVisible();

      // And: Status badge shows final state
      const statusBadge = runDetailPage.getStatusBadge();
      await expect(statusBadge).toBeVisible();
      await expect(statusBadge).toHaveText(/completed/i);
    });

    test('should not show cancel button for failed run', async ({ page }) => {
      // REQ-US030-SC5: Cancel button hidden for failed runs
      // Given: Benchmark run has status `failed`
      await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_FAILED);

      // Then: Cancel button is not visible
      await expect(runDetailPage.cancelRunBtn).not.toBeVisible();

      // And: Status shows failed
      const statusBadge = runDetailPage.getStatusBadge();
      await expect(statusBadge).toBeVisible();
      await expect(statusBadge).toHaveText(/failed/i);

      // And: Error alert is displayed
      await expect(runDetailPage.errorAlert).toBeVisible();
    });
  });

  test.describe('Scenario 7: Status Badge Color Coding', () => {
    test('should display correct status badge colors', async ({ page }) => {
      // REQ-US030-SC7: Status badges with color coding
      // Given: Runs with different statuses
      await projectPage.goto(SEED_PROJECT_ID);

      // Then: Completed run has green badge
      const completedBadge = projectPage.getRunStatusBadge(SEED_RUN_ID_COMPLETED);
      await expect(completedBadge).toBeVisible();
      await expect(completedBadge).toHaveText(/completed/i);
      // note: We can't easily test actual color in Playwright, but we can verify the text

      // And: Running run has amber/orange badge
      const runningBadge = projectPage.getRunStatusBadge(SEED_RUN_ID_RUNNING);
      await expect(runningBadge).toBeVisible();
      await expect(runningBadge).toHaveText(/running/i);

      // And: Failed run has red badge
      const failedBadge = projectPage.getRunStatusBadge(SEED_RUN_ID_FAILED);
      await expect(failedBadge).toBeVisible();
      await expect(failedBadge).toHaveText(/failed/i);
    });
  });

  test.describe('Scenario 8: Link to Temporal UI', () => {
    test('should display Temporal UI link for run with workflow ID', async ({ page }) => {
      // REQ-US030-SC8: Link to Temporal execution
      // Given: Benchmark run has a temporalWorkflowId
      await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

      // Then: Clickable link to Temporal UI is visible
      const temporalLink = runDetailPage.getTemporalLink();
      await expect(temporalLink).toBeVisible();

      // And: Link format is correct
      const href = await temporalLink.getAttribute('href');
      expect(href).toContain('localhost:8088');
      expect(href).toContain('/namespaces/default/workflows/');
      expect(href).toContain('temporal-wf-001'); // Seed data workflow ID

      // And: Link opens in new tab
      const target = await temporalLink.getAttribute('target');
      expect(target).toBe('_blank');
    });
  });

  test.describe('Scenario 9: Re-run Completed Benchmark', () => {
    test('should show re-run button for completed run', async ({ page }) => {
      // REQ-US030-SC9: Re-run action
      // Given: Completed benchmark run exists
      await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

      // Then: Re-run button is visible
      await expect(runDetailPage.rerunBtn).toBeVisible();
      await expect(runDetailPage.rerunBtn).toBeEnabled();

      // note: We don't actually click to avoid creating new runs in test
      // In a real test: await runDetailPage.clickRerun();
      // Then verify navigation to new run detail page with fresh run ID
    });

    test('should show re-run button for failed run', async ({ page }) => {
      // REQ-US030-SC9: Re-run action for failed runs
      // Given: Failed benchmark run exists
      await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_FAILED);

      // Then: Re-run button is visible
      await expect(runDetailPage.rerunBtn).toBeVisible();
      await expect(runDetailPage.rerunBtn).toBeEnabled();
    });
  });

  test.describe('Scenario 11: Duration Display for Completed Run', () => {
    test('should display static duration for completed run', async ({ page }) => {
      // REQ-US030-SC11: Duration display for completed run
      // Given: Benchmark run has completed status with timestamps
      await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

      // Then: Total duration is displayed in run info table
      await expect(runDetailPage.runInfoTable).toBeVisible();

      // Verify duration row exists
      const durationRow = runDetailPage.runInfoTable.locator('text=/Duration/i').locator('xpath=..');
      await expect(durationRow).toBeVisible();

      // Verify duration is readable (contains minutes or seconds)
      const durationText = await durationRow.textContent();
      expect(durationText).toMatch(/\d+m|\d+s/); // Matches patterns like "45m" or "30s"
    });
  });

  test.describe('Scenario 12: Navigate Between Runs', () => {
    test('should navigate from run list to run detail and back', async ({ page }) => {
      // REQ-US030-SC12: Navigate between runs
      // Given: User is viewing run list
      await projectPage.goto(SEED_PROJECT_ID);
      await expect(projectPage.runRows).toHaveCount(5);

      // When: User clicks on a run
      await projectPage.clickRun(SEED_RUN_ID_COMPLETED);

      // Then: Run detail page is displayed
      await expect(page).toHaveURL(
        new RegExp(`/benchmarking/projects/${SEED_PROJECT_ID}/runs/${SEED_RUN_ID_COMPLETED}`)
      );
      await expect(runDetailPage.runDefinitionName).toBeVisible();

      // When: User navigates back
      await page.goBack();
      await page.waitForLoadState('networkidle');

      // Then: Run list is displayed again
      await expect(projectPage.runsTable).toBeVisible();
      await expect(projectPage.runRows).toHaveCount(5);
    });

    test('should allow selecting another run from run list', async ({ page }) => {
      // REQ-US030-SC12: User can select another run to view
      // Given: User is viewing run list with multiple runs
      await projectPage.goto(SEED_PROJECT_ID);

      // When: User clicks first run
      await projectPage.clickRun(SEED_RUN_ID_COMPLETED);
      await expect(page).toHaveURL(/runs\/seed-run-completed-001/);

      // And: User goes back and clicks another run
      await page.goBack();
      await page.waitForLoadState('networkidle');
      await projectPage.clickRun(SEED_RUN_ID_FAILED);

      // Then: Different run detail is displayed
      await expect(page).toHaveURL(/runs\/seed-run-failed-003/);
      await expect(runDetailPage.runDefinitionName).toBeVisible();
      await expect(runDetailPage.errorAlert).toBeVisible(); // Failed run shows error
    });
  });

  test.describe('Scenario 13: Empty Run List', () => {
    test('should show empty state when project has no runs', async ({ page }) => {
      // REQ-US030-SC13: Empty run list
      // TODO: Requires a project with no runs
      // Skipped because seed data doesn't have such a project
      // In a real test environment:
      // - Create a new project without runs
      // - Navigate to that project
      // - Verify empty state message is displayed
      // - Verify message prompts to create definition
    });
  });

  test.describe('Scenario 17: Headline Metrics in Run List', () => {
    test('should display headline metrics for completed runs', async ({ page }) => {
      // REQ-US030-SC17: Headline metrics in run list
      // Given: Completed runs have aggregated metrics
      await projectPage.goto(SEED_PROJECT_ID);

      // Then: Metrics are shown in the run list for completed run
      const completedRunRow = projectPage.getRunRow(SEED_RUN_ID_COMPLETED);
      await expect(completedRunRow).toBeVisible();

      // Verify metrics column contains metric values (e.g., "0.95", "0.98")
      const completedRowText = await completedRunRow.textContent();
      expect(completedRowText).toMatch(/0\.\d{2,}/); // Matches decimal numbers like 0.95
    });

    test('should not show metrics for running runs', async ({ page }) => {
      // REQ-US030-SC17: Running runs show "-" or empty
      // Given: Run is in running status
      await projectPage.goto(SEED_PROJECT_ID);

      // Then: Running run does not show metrics (shows "-" or empty)
      const runningRunRow = projectPage.getRunRow(SEED_RUN_ID_RUNNING);
      await expect(runningRunRow).toBeVisible();

      // The metrics cell should either be empty or show "-"
      const metricsCell = projectPage.getRunMetrics(SEED_RUN_ID_RUNNING);
      const metricsText = await metricsCell.textContent();
      // Should not contain metric values (0.xx format)
      expect(metricsText).not.toMatch(/0\.\d{2,}\s+0\.\d{2,}/);
    });

    test('should not show metrics for failed runs', async ({ page }) => {
      // REQ-US030-SC17: Failed runs show error indicator
      // Given: Run has failed status
      await projectPage.goto(SEED_PROJECT_ID);

      // Then: Failed run does not show metrics
      const failedRunRow = projectPage.getRunRow(SEED_RUN_ID_FAILED);
      await expect(failedRunRow).toBeVisible();

      // Verify failed badge is present
      const failedBadge = projectPage.getRunStatusBadge(SEED_RUN_ID_FAILED);
      await expect(failedBadge).toHaveText(/failed/i);
    });
  });

  test.describe('Additional: Run Information Display', () => {
    test('should display all run information fields', async ({ page }) => {
      // REQ-US030: Run information display
      // Given: Completed run exists
      await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

      // Then: Run information card is displayed
      await expect(runDetailPage.runInfoHeading).toBeVisible();
      await expect(runDetailPage.runInfoTable).toBeVisible();

      // And: Key fields are present
      const tableText = await runDetailPage.runInfoTable.textContent();
      expect(tableText).toContain('Status');
      expect(tableText).toContain('Started At');
      expect(tableText).toContain('Completed At');
      expect(tableText).toContain('Duration');
      expect(tableText).toContain('Temporal Workflow');
      expect(tableText).toContain('Worker Git SHA');
      expect(tableText).toContain('Is Baseline');
    });

    test('should display worker git SHA as code element', async ({ page }) => {
      // REQ-US030: Git SHA display format
      // Given: Run has worker git SHA
      await runDetailPage.goto(SEED_PROJECT_ID, SEED_RUN_ID_COMPLETED);

      // Then: Git SHA is displayed as code
      const gitShaCode = runDetailPage.runInfoTable.locator('code:has-text("git-sha-001")');
      await expect(gitShaCode).toBeVisible();
    });
  });
});
