/**
 * One-time script to generate workflow history fixture for replay tests.
 * Run: npm run test:generate-history
 * Commit the generated file src/__fixtures__/ocr-workflow-history.json.
 * Re-run after changing the workflow's default path or steps.
 */

import * as fs from 'fs';
import * as path from 'path';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { ocrWorkflow } from '../workflow';
import { mockActivities } from '../test/mock-activities';
import type { OCRWorkflowInput } from '../types';

const TASK_QUEUE = 'test';
const FIXTURE_DIR = path.join(__dirname, '..', '__fixtures__');
const FIXTURE_FILE = path.join(FIXTURE_DIR, 'ocr-workflow-history.json');

async function main(): Promise<void> {
  console.log('[generate-history-fixture] Starting...');

  const testEnv = await TestWorkflowEnvironment.createTimeSkipping();

  try {
    const workflowsPath = require.resolve('../workflow');
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: 'default',
      taskQueue: TASK_QUEUE,
      workflowsPath,
      activities: mockActivities,
    });

    const input: OCRWorkflowInput = {
      documentId: 'fixture-document-id',
      blobKey: 'documents/fixture-doc/original.pdf',
      fileName: 'fixture.pdf',
      fileType: 'pdf',
      contentType: 'application/pdf',
    };

    const workflowId = `ocr-fixture-${Date.now()}`;
    const handle = await testEnv.client.workflow.start(ocrWorkflow, {
      workflowId,
      taskQueue: TASK_QUEUE,
      args: [input],
    });

    await worker.runUntil(handle.result());
    console.log('[generate-history-fixture] Workflow completed.');

    const history = await handle.fetchHistory();

    if (!fs.existsSync(FIXTURE_DIR)) {
      fs.mkdirSync(FIXTURE_DIR, { recursive: true });
    }
    fs.writeFileSync(FIXTURE_FILE, JSON.stringify(history, null, 2), 'utf8');
    const eventCount = (history as { events?: unknown[] }).events?.length ?? 0;
    console.log(`[generate-history-fixture] Wrote history (${eventCount} events) to ${FIXTURE_FILE}`);
  } finally {
    await testEnv.teardown();
  }
}

main().catch((err) => {
  console.error('[generate-history-fixture] Error:', err);
  process.exit(1);
});
