/**
 * Temporal Worker for OCR Workflow
 * Registers workflows and activities, connects to Temporal server
 */

import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from './activities';
// Workflows are automatically discovered via workflowsPath in Worker.create()

async function run() {
  // Load environment variables
  require('dotenv').config();

  const address = process.env.TEMPORAL_ADDRESS || 'localhost:7233';
  const namespace = process.env.TEMPORAL_NAMESPACE || 'default';
  const taskQueue = process.env.TEMPORAL_TASK_QUEUE || 'ocr-processing';

  console.log(JSON.stringify({
    component: 'worker',
    event: 'initializing',
    address,
    namespace,
    taskQueue,
    timestamp: new Date().toISOString()
  }));

  // Create connection to Temporal server
  const connection = await NativeConnection.connect({
    address,
    // TLS configuration can be added here if needed
  });

  // Create worker
  const worker = await Worker.create({
    connection,
    namespace,
    workflowsPath: require.resolve('./workflow'),
    activities,
    taskQueue,
  });

  console.log(JSON.stringify({
    component: 'worker',
    event: 'ready',
    taskQueue,
    timestamp: new Date().toISOString()
  }));

  // Run worker (this will block until worker is shut down)
  await worker.run();

  console.log(JSON.stringify({
    component: 'worker',
    event: 'stopped',
    timestamp: new Date().toISOString()
  }));
}

run().catch((err) => {
  console.error(JSON.stringify({
    component: 'worker',
    event: 'fatal_error',
    error: err instanceof Error ? err.message : 'Unknown error',
    stack: err instanceof Error ? err.stack : undefined,
    timestamp: new Date().toISOString()
  }));
  process.exit(1);
});

