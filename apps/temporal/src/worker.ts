/**
 * Temporal Worker for OCR Workflow and Benchmark Workflows
 * Registers workflows and activities, connects to Temporal server
 * Supports multiple task queues for isolation between production and benchmarking
 */

// MUST be first import: populates process.env (external override + repo .env)
// before any module below reads env at import time.
import "./env-loader";

import * as http from "node:http";
import { NativeConnection, Worker } from "@temporalio/worker";
import { activityOutputCache } from "./activities/cache/activity-output-cache.activities";
import { getActivityRegistry } from "./activity-registry";
import { dynRun } from "./dynamic-nodes/dyn-run.activity";
import { dynamicNodeResolveLineage } from "./dynamic-nodes/resolve-lineage.activity";
import { workerLogger } from "./logger";
import { getRegistry } from "./metrics";
import { installTemporalRuntimeLogger } from "./temporal-runtime-logger";

// Workflows are automatically discovered via workflowsPath in Worker.create()

async function run() {
  // Env already loaded via top-of-file `import "./env-loader"`.

  // Route Temporal SDK logs through shared logger (pretty in dev, NDJSON in prod).
  installTemporalRuntimeLogger();

  // Expose Prometheus metrics on a dedicated HTTP server so Prometheus can scrape them.
  const metricsPort = parseInt(process.env.METRICS_PORT ?? "9091", 10);
  const metricsServer = http.createServer(async (_req, res) => {
    const metrics = await getRegistry().metrics();
    res.setHeader("Content-Type", getRegistry().contentType);
    res.end(metrics);
  });
  metricsServer.listen(metricsPort, () => {
    workerLogger.info("Metrics server listening", {
      event: "metrics_server_ready",
      port: metricsPort,
    });
  });

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

  // Phase 4 (US-133 + US-134) — register the cache-proxy activities the
  // worker decorator calls (`findFresh`, `upsert`) plus the hourly GC
  // sweep (`gc`). Kept out of the graph-node registry on purpose:
  // these are infrastructure activities the workflow runtime dispatches
  // itself, not selectable activity types for graph authors. The
  // dot-namespaced keys match the dispatch shape in
  // `apps/temporal/src/graph-workflow.ts` and `cache-gc-workflow.ts`.
  activitiesMap["activityOutputCache.findFresh"] =
    activityOutputCache.findFresh as (...args: unknown[]) => Promise<unknown>;
  activitiesMap["activityOutputCache.upsert"] = activityOutputCache.upsert as (
    ...args: unknown[]
  ) => Promise<unknown>;
  activitiesMap["activityOutputCache.gc"] = activityOutputCache.gc as (
    ...args: unknown[]
  ) => Promise<unknown>;

  // Phase 6 Milestone C (US-170 + US-171) — register the two dynamic-node
  // activities. `dyn.run` is the single shared activity that wraps every
  // `dyn.<slug>` node invocation via the `deno-runner` HTTP service.
  // `dynamicNode.resolveLineage` is the short executor-side lookup that
  // translates `(groupId, slug, version?)` → immutable `versionId` —
  // registered as `nonCacheable: true` (the lineage head can change between
  // executions; caching would defeat hot-reload).
  activitiesMap["dyn.run"] = dynRun as (...args: unknown[]) => Promise<unknown>;
  activitiesMap["dynamicNode.resolveLineage"] = dynamicNodeResolveLineage as (
    ...args: unknown[]
  ) => Promise<unknown>;

  // Create workers array to track all running workers
  const workers: Worker[] = [];

  // Create primary worker for production OCR processing.
  // `./workflows` is the barrel that re-exports both `graphWorkflow` and
  // the Phase 4 / US-134 `cacheGcWorkflow`, so the worker can dispatch
  // both from the same task queue. The benchmark worker keeps its own
  // dedicated `./benchmark-workflows` bundle.
  const ocrWorker = await Worker.create({
    connection,
    namespace,
    workflowsPath: require.resolve("./workflows"),
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
