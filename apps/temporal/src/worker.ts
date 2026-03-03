/**
 * Temporal Worker for OCR Workflow
 * Registers workflows and activities, connects to Temporal server
 */

import { NativeConnection, Worker } from '@temporalio/worker';
import { getActivityRegistry } from './activity-registry';
import { workerLogger } from './logger';
// Workflows are automatically discovered via workflowsPath in Worker.create()

async function run() {
  // Load environment variables
  require('dotenv').config();

  const address = process.env.TEMPORAL_ADDRESS || 'localhost:7233';
  const namespace = process.env.TEMPORAL_NAMESPACE || 'default';
  const taskQueue = process.env.TEMPORAL_TASK_QUEUE || 'ocr-processing';

  workerLogger.info('Worker initializing', {
    event: 'initializing',
    address,
    namespace,
    taskQueue,
  });

  // Create connection to Temporal server
  const connection = await NativeConnection.connect({
    address,
    // TLS configuration can be added here if needed
  });

  // Build activities object from registry with namespaced type strings as keys
  const registry = getActivityRegistry();
  const activitiesMap: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  for (const [activityType, entry] of registry) {
    activitiesMap[activityType] = entry.activityFn;
  }

  // Create worker
  const worker = await Worker.create({
    connection,
    namespace,
    workflowsPath: require.resolve('./graph-workflow'),
    activities: activitiesMap,
    taskQueue,
  });

  workerLogger.info('Worker ready', { event: 'ready', taskQueue });

  // Run worker (this will block until worker is shut down)
  await worker.run();

  workerLogger.info('Worker stopped', { event: 'stopped' });
}

run().catch((err) => {
  workerLogger.error('Worker fatal error', {
    event: 'fatal_error',
    error: err instanceof Error ? err.message : 'Unknown error',
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});

