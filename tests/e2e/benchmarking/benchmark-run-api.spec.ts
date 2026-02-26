import { test, expect } from '@playwright/test';

/**
 * E2E Test: Benchmark Run API Flow
 *
 * Tests the benchmark run lifecycle via the backend API:
 * 1. Verify existing seed runs can be fetched
 * 2. Start a benchmark run
 * 3. Verify the run is created with proper fields (mlflowRunId, temporalWorkflowId)
 * 4. Poll for completion
 *
 * Prerequisites:
 * - Backend running at BACKEND_URL (default: http://localhost:3002)
 * - Temporal running at localhost:7233
 * - Temporal worker running on 'benchmark-processing' task queue
 * - MLflow running at localhost:5000
 * - Database seeded (handled by global-setup.ts)
 */
test.describe('Benchmark Run API E2E', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  // Seed data IDs (from apps/shared/prisma/seed.ts)
  const SEED_PROJECT_ID = 'seed-project-invoice-extraction';
  const SEED_DEFINITION_ID = 'seed-definition-baseline';
  const SEED_RUN_ID_COMPLETED = 'seed-run-completed-001';

  const headers = () => ({
    'x-api-key': TEST_API_KEY!,
    'Content-Type': 'application/json',
  });

  test.beforeAll(() => {
    if (!TEST_API_KEY) {
      throw new Error('TEST_API_KEY environment variable is not set');
    }
  });

  test('should fetch seed run details with complete fields', async ({ request }) => {
    const response = await request.get(
      `${BACKEND_URL}/api/benchmark/projects/${SEED_PROJECT_ID}/runs/${SEED_RUN_ID_COMPLETED}`,
      { headers: headers() },
    );

    expect(response.ok(), `Expected 200 but got ${response.status()}`).toBeTruthy();
    const run = await response.json();

    expect(run.id).toBe(SEED_RUN_ID_COMPLETED);
    expect(run.status).toBe('completed');
    expect(run.mlflowRunId).toBeTruthy();
    expect(run.temporalWorkflowId).toBeTruthy();
    expect(run.metrics).toBeTruthy();
    expect(run.isBaseline).toBe(true);
    expect(run.workerGitSha).toBeTruthy();
  });

  test('should start a benchmark run with mlflowRunId and temporalWorkflowId populated', async ({ request }) => {
    // This is the key test that validates the fixes:
    // - mlflowRunId was undefined in the workflow input (now fixed)
    // - temporalWorkflowId must be set after workflow starts
    const startResponse = await request.post(
      `${BACKEND_URL}/api/benchmark/projects/${SEED_PROJECT_ID}/definitions/${SEED_DEFINITION_ID}/runs`,
      {
        headers: headers(),
        data: {
          tags: { e2e_test: 'true' },
        },
      },
    );

    if (!startResponse.ok()) {
      const body = await startResponse.text();
      console.error(`Start run failed with status ${startResponse.status()}: ${body}`);
    }
    expect(startResponse.ok(), `Expected 2xx but got ${startResponse.status()}`).toBeTruthy();
    const run = await startResponse.json();

    // Verify the run was created with all required fields
    expect(run.id).toBeTruthy();
    expect(run.definitionId).toBe(SEED_DEFINITION_ID);
    expect(run.projectId).toBe(SEED_PROJECT_ID);
    expect(run.status).toMatch(/pending|running/);

    // Critical: mlflowRunId must be populated (this was the bug - it was undefined)
    expect(run.mlflowRunId).toBeTruthy();
    expect(typeof run.mlflowRunId).toBe('string');
    expect(run.mlflowRunId.length).toBeGreaterThan(0);

    // Critical: temporalWorkflowId must be populated
    expect(run.temporalWorkflowId).toBeTruthy();
    expect(run.temporalWorkflowId).toContain('benchmark-run-');

    // Verify worker metadata is present
    expect(run.workerGitSha).toBeTruthy();
  });

  test('should start a run and poll until terminal state', async ({ request }) => {
    // This test waits for the workflow to reach a terminal state.
    // It requires Temporal worker and MLflow to be running.
    test.setTimeout(180_000); // 3 minutes max

    // Start a benchmark run
    const startResponse = await request.post(
      `${BACKEND_URL}/api/benchmark/projects/${SEED_PROJECT_ID}/definitions/${SEED_DEFINITION_ID}/runs`,
      {
        headers: headers(),
        data: {
          tags: { e2e_test: 'true', poll_test: 'true' },
        },
      },
    );

    expect(startResponse.ok(), `Start failed: ${startResponse.status()}`).toBeTruthy();
    const startedRun = await startResponse.json();
    const runId = startedRun.id;

    expect(runId).toBeTruthy();
    expect(startedRun.mlflowRunId).toBeTruthy();

    // Poll for completion
    let finalStatus = startedRun.status;
    const maxPolls = 60;
    const pollIntervalMs = 3000;

    for (let i = 0; i < maxPolls; i++) {
      if (finalStatus !== 'pending' && finalStatus !== 'running') {
        break;
      }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));

      const pollResponse = await request.get(
        `${BACKEND_URL}/api/benchmark/projects/${SEED_PROJECT_ID}/runs/${runId}`,
        { headers: headers() },
      );

      expect(pollResponse.ok()).toBeTruthy();
      const pollRun = await pollResponse.json();
      finalStatus = pollRun.status;
    }

    // The run should have reached a terminal state (not stuck in pending/running)
    expect(['completed', 'failed', 'cancelled']).toContain(finalStatus);

    // Get final run details
    const finalResponse = await request.get(
      `${BACKEND_URL}/api/benchmark/projects/${SEED_PROJECT_ID}/runs/${runId}`,
      { headers: headers() },
    );

    expect(finalResponse.ok()).toBeTruthy();
    const finalRun = await finalResponse.json();

    // Verify the run has a completedAt timestamp regardless of final status
    expect(finalRun.completedAt).toBeTruthy();

    if (finalStatus === 'completed') {
      expect(finalRun.metrics).toBeTruthy();
    } else if (finalStatus === 'failed') {
      expect(finalRun.error).toBeTruthy();
    }
  });

  test('should return 404 for non-existent run', async ({ request }) => {
    const response = await request.get(
      `${BACKEND_URL}/api/benchmark/projects/${SEED_PROJECT_ID}/runs/non-existent-run-id`,
      { headers: headers() },
    );

    expect(response.status()).toBe(404);
  });
});
