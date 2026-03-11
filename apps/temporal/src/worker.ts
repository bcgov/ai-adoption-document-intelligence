/**
 * Temporal Worker for OCR Workflow and Benchmark Workflows
 * Registers workflows and activities, connects to Temporal server
 * Supports multiple task queues for isolation between production and benchmarking
 */

import { NativeConnection, Worker } from "@temporalio/worker";
import { getActivityRegistry } from "./activity-registry";
import { workerLogger } from "./logger";

// Workflows are automatically discovered via workflowsPath in Worker.create()

async function run() {
  // Load environment variables
  const dotenv = await import("dotenv");
  dotenv.config();

  const address = process.env.TEMPORAL_ADDRESS || "localhost:7233";
  const namespace = process.env.TEMPORAL_NAMESPACE || "default";
  const taskQueue = process.env.TEMPORAL_TASK_QUEUE || "ocr-processing";

  // Support for benchmark-processing queue isolation (US-023)
  const benchmarkTaskQueue =
    process.env.BENCHMARK_TASK_QUEUE || "benchmark-processing";
  const enableBenchmarkQueue = process.env.ENABLE_BENCHMARK_QUEUE !== "false"; // enabled by default

  workerLogger.info("Worker initializing", {
    event: "initializing",
    address,
    namespace,
    taskQueue,
    benchmarkTaskQueue,
    enableBenchmarkQueue,
  });

  // Create connection to Temporal server
  const connection = await NativeConnection.connect({
    address,
    // TLS configuration can be added here if needed
  });

  // Build activities object from registry with namespaced type strings as keys
  const registry = getActivityRegistry();
  const activitiesMap: Record<
    string,
    (...args: unknown[]) => Promise<unknown>
  > = {};
  for (const [activityType, entry] of registry) {
    activitiesMap[activityType] = entry.activityFn;
  }

  // Create workers array to track all running workers
  const workers: Worker[] = [];

  // Create primary worker for production OCR processing
  const ocrWorker = await Worker.create({
    connection,
    namespace,
    workflowsPath: require.resolve("./graph-workflow"),
    activities: activitiesMap,
    taskQueue,
  });
  workers.push(ocrWorker);

  workerLogger.info("Worker ready", { event: "ready", taskQueue });

  // Create separate worker for benchmark processing if enabled
  if (enableBenchmarkQueue && benchmarkTaskQueue !== taskQueue) {
    const benchmarkWorker = await Worker.create({
      connection,
      namespace,
      workflowsPath: require.resolve("./benchmark-workflows"),
      activities: activitiesMap,
      taskQueue: benchmarkTaskQueue,
    });
    workers.push(benchmarkWorker);

    workerLogger.info("Benchmark worker ready", {
      event: "benchmark_worker_ready",
      taskQueue: benchmarkTaskQueue,
    });
  }

  // Run all workers in parallel
  await Promise.all(workers.map((worker) => worker.run()));

  workerLogger.info("Worker stopped", { event: "stopped" });
}

run().catch((err) => {
  workerLogger.error("Worker fatal error", {
    event: "fatal_error",
    error: err instanceof Error ? err.message : "Unknown error",
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
