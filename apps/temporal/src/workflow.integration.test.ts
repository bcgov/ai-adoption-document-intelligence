/**
 * Integration test: runs the OCR workflow with time-skipping and mocked activities.
 * Validates durable execution (timers, steps) without a real Temporal server or DB.
 * Includes tests for typical non-default configs (steps disabled, parameters overridden).
 */

import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { ocrWorkflow } from './workflow';
import { mockActivities } from './test/mock-activities';
import type { OCRWorkflowInput, OCRResult } from './types';

const TASK_QUEUE = 'test';

const baseInput: OCRWorkflowInput = {
  documentId: 'integration-test-doc',
  binaryData: Buffer.from('%PDF-1.4 minimal').toString('base64'),
  fileName: 'integration.pdf',
  fileType: 'pdf',
  contentType: 'application/pdf',
};

async function runWorkflowWithInput(
  testEnv: TestWorkflowEnvironment,
  input: OCRWorkflowInput,
  workflowIdSuffix: string
): Promise<OCRResult> {
  const workflowsPath = require.resolve('./workflow');
  const worker = await Worker.create({
    connection: testEnv.nativeConnection,
    namespace: 'default',
    taskQueue: TASK_QUEUE,
    workflowsPath,
    activities: mockActivities,
  });
  return worker.runUntil(
    testEnv.client.workflow.execute(ocrWorkflow, {
      workflowId: `ocr-integration-${workflowIdSuffix}-${Date.now()}`,
      taskQueue: TASK_QUEUE,
      args: [input],
    })
  );
}

describe('OCR workflow integration (durable execution)', () => {
  let testEnv: TestWorkflowEnvironment;

  beforeAll(async () => {
    testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  }, 30000);

  afterAll(async () => {
    await testEnv?.teardown();
  });

  it('runs workflow to completion with default config', async () => {
    const result = await runWorkflowWithInput(testEnv, baseInput, 'default');

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.status).toBe('succeeded');
    expect(result.fileName).toBe('integration.pdf');
    expect(result.extractedText).toBeDefined();
    expect(result.pages).toHaveLength(1);
  }, 20000);

  it('completes with human review disabled (high-confidence path)', async () => {
    const input: OCRWorkflowInput = {
      ...baseInput,
      documentId: 'integration-no-review',
      steps: {
        humanReview: { enabled: false },
      },
    };
    const result = await runWorkflowWithInput(testEnv, input, 'no-review');

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.status).toBe('succeeded');
    expect(result.fileName).toBe('integration.pdf');
  }, 20000);

  it('completes with post-OCR cleanup disabled', async () => {
    const input: OCRWorkflowInput = {
      ...baseInput,
      documentId: 'integration-no-cleanup',
      steps: {
        postOcrCleanup: { enabled: false },
      },
    };
    const result = await runWorkflowWithInput(testEnv, input, 'no-cleanup');

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.status).toBe('succeeded');
    expect(result.extractedText).toBeDefined();
  }, 20000);

  it('completes with lower confidence threshold (still above threshold)', async () => {
    const input: OCRWorkflowInput = {
      ...baseInput,
      documentId: 'integration-low-threshold',
      steps: {
        checkOcrConfidence: { parameters: { threshold: 0.85 } },
      },
    };
    const result = await runWorkflowWithInput(testEnv, input, 'low-threshold');

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.status).toBe('succeeded');
  }, 20000);
});
