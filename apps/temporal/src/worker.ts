/**
 * Temporal Worker for OCR Workflow and Benchmark Workflows
 * Registers workflows and activities, connects to Temporal server
 * Supports multiple task queues for isolation between production and benchmarking
 */

// MUST be first import: populates process.env (external override + repo .env)
// before any module below reads env at import time.
import "./env-loader";

import * as http from "node:http";
import { Connection, ScheduleClient } from "@temporalio/client";
import type { ActivityInterceptorsFactory } from "@temporalio/worker";
import { NativeConnection, Worker } from "@temporalio/worker";
import { activityOutputCache } from "./activities/cache/activity-output-cache.activities";
import { getPrismaClient } from "./activities/database-client";
import { getActivityRegistry } from "./activity-registry";
import { ActivityBillingInterceptor } from "./billing/activity-billing-interceptor";
import {
  runMonthEndArchival,
  runNightlyStorageCharge,
} from "./billing/nightly-storage-charge.activity";
import { UsageEventWriter } from "./billing/usage-event-writer";
import { initStorageLedger } from "./blob-storage/blob-storage-client";
import { dynRun } from "./dynamic-nodes/dyn-run.activity";
import { dynamicNodeResolveLineage } from "./dynamic-nodes/resolve-lineage.activity";
import { workerLogger } from "./logger";
import { getRegistry } from "./metrics";
import { temporalDataConverter } from "./temporal-data-converter";
import { installTemporalRuntimeLogger } from "./temporal-runtime-logger";

// Workflows are automatically discovered via workflowsPath in Worker.create()

// Module-level reference to Temporal connection for health checks
let temporalConnection: NativeConnection | null = null;

/**
 * Check worker health by testing database and Temporal connectivity.
 */
async function checkWorkerHealth(): Promise<{
  status: "healthy" | "unhealthy";
  checks: {
    database: "ok" | "error";
    temporal: "ok" | "error";
  };
  timestamp: string;
  errors?: string[];
}> {
  const errors: string[] = [];
  const checks = {
    database: "error" as "ok" | "error",
    temporal: "error" as "ok" | "error",
  };

  // Check database connectivity
  try {
    const prisma = getPrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    errors.push(`Database: ${message}`);
    workerLogger.error("Health check - database failed", {
      event: "health_check_failed",
      dependency: "database",
      error: message,
    });
  }

  // Check Temporal connectivity
  try {
    if (temporalConnection) {
      // If the connection object exists and the worker is running, Temporal is healthy.
      // The NativeConnection maintains a gRPC channel to Temporal server.
      // If connectivity fails, workers will fail to poll tasks and log errors,
      // but the connection object itself doesn't expose a testable health method.
      checks.temporal = "ok";
    } else {
      errors.push("Temporal: Connection not initialized");
      workerLogger.error("Health check - Temporal connection not initialized", {
        event: "health_check_failed",
        dependency: "temporal",
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    errors.push(`Temporal: ${message}`);
    workerLogger.error("Health check - Temporal failed", {
      event: "health_check_failed",
      dependency: "temporal",
      error: message,
    });
  }

  const status =
    checks.database === "ok" && checks.temporal === "ok"
      ? "healthy"
      : "unhealthy";

  return {
    status,
    checks,
    timestamp: new Date().toISOString(),
    ...(errors.length > 0 && { errors }),
  };
}

const NIGHTLY_STORAGE_SCHEDULE_ID = "nightly-storage-charge";

/**
 * Ensures the nightly storage charge Temporal Schedule exists.
 * Idempotent — creates the schedule only if it does not already exist.
 * Runs at 00:05 UTC every day to process the previous calendar day.
 */
async function ensureNightlyStorageChargeSchedule(opts: {
  address: string;
  namespace: string;
  billingTaskQueue: string;
}): Promise<void> {
  const connection = await Connection.connect({ address: opts.address });
  try {
    const scheduleClient = new ScheduleClient({
      connection,
      namespace: opts.namespace,
    });

    try {
      await scheduleClient.create({
        scheduleId: NIGHTLY_STORAGE_SCHEDULE_ID,
        spec: {
          // Run at 00:05 UTC daily so the previous day's data is fully written
          cronExpressions: ["5 0 * * *"],
        },
        policies: {
          // If the billing worker is down and misses a scheduled run, catch up
          // for up to 25 hours so at most one day of charges can be lost.
          // The workflow uses Temporal deterministic time, so catch-up runs
          // correctly charge for their originally scheduled day, not "today".
          catchupWindow: "25 hours",
        },
        action: {
          type: "startWorkflow",
          workflowType: "nightlyStorageChargeWorkflow",
          taskQueue: opts.billingTaskQueue,
        },
      });

      workerLogger.info("Created nightly storage charge schedule", {
        event: "schedule_created",
        scheduleId: NIGHTLY_STORAGE_SCHEDULE_ID,
      });
    } catch (err: unknown) {
      // ALREADY_EXISTS is expected after first startup — treat as success
      const isAlreadyExists =
        err instanceof Error &&
        (err.message.includes("already exists") ||
          err.message.includes("ALREADY_EXISTS"));
      if (!isAlreadyExists) {
        workerLogger.warn(
          `Failed to create nightly storage charge schedule: ${err instanceof Error ? err.message : String(err)}`,
          {
            event: "schedule_create_failed",
            scheduleId: NIGHTLY_STORAGE_SCHEDULE_ID,
          },
        );
      }
    }
  } finally {
    await connection.close();
  }
}

async function run() {
  // Env already loaded via top-of-file `import "./env-loader"`.

  // Route Temporal SDK logs through shared logger (pretty in dev, NDJSON in prod).
  installTemporalRuntimeLogger();

  // Expose Prometheus metrics and health checks on a dedicated HTTP server
  const metricsPort = parseInt(process.env.METRICS_PORT ?? "9091", 10);
  const metricsServer = http.createServer(async (req, res) => {
    const url = req.url || "/";

    // Health check endpoints
    if (url === "/health/live") {
      // Liveness: process is running and responsive
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (url === "/health/ready" || url === "/health") {
      // Readiness: can connect to database
      // Note: Temporal connectivity is implicit - if worker is running, it's connected
      const health = await checkWorkerHealth();
      const statusCode = health.status === "healthy" ? 200 : 503;
      res.writeHead(statusCode, { "Content-Type": "application/json" });
      res.end(JSON.stringify(health));
      return;
    }

    // Default: Prometheus metrics
    if (url === "/metrics" || url === "/") {
      const metrics = await getRegistry().metrics();
      res.setHeader("Content-Type", getRegistry().contentType);
      res.end(metrics);
      return;
    }

    // 404 for unknown paths
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  });
  metricsServer.listen({ port: metricsPort, exclusive: false }, () => {
    workerLogger.info("Metrics server listening", {
      event: "metrics_server_ready",
      port: metricsPort,
    });
  });

  const shutdown = () => {
    metricsServer.close(() => {
      workerLogger.info("Metrics server closed", {
        event: "metrics_server_closed",
      });
    });
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

  const address = process.env.TEMPORAL_ADDRESS || "localhost:7233";
  const namespace = process.env.TEMPORAL_NAMESPACE || "default";
  const taskQueue = process.env.TEMPORAL_TASK_QUEUE || "ocr-processing";

  // Support for benchmark-processing queue isolation (US-023)
  const benchmarkTaskQueue =
    process.env.BENCHMARK_TASK_QUEUE || "benchmark-processing";
  const enableBenchmarkQueue = process.env.ENABLE_BENCHMARK_QUEUE !== "false"; // enabled by default

  // Worker concurrency settings for horizontal scaling (Group 5: HA)
  // maxConcurrentActivityTaskExecutions: Max parallel activities per worker pod
  // maxConcurrentWorkflowTaskExecutions: Max parallel workflow decision tasks per worker pod
  const maxConcurrentActivityTaskExecutions = parseInt(
    process.env.MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS ?? "10",
    10,
  );
  const maxConcurrentWorkflowTaskExecutions = parseInt(
    process.env.MAX_CONCURRENT_WORKFLOW_TASK_EXECUTIONS ?? "100",
    10,
  );

  workerLogger.info("Worker initializing", {
    event: "initializing",
    address,
    namespace,
    taskQueue,
    benchmarkTaskQueue,
    enableBenchmarkQueue,
    maxConcurrentActivityTaskExecutions,
    maxConcurrentWorkflowTaskExecutions,
  });

  // Create connection to Temporal server
  const connection = await NativeConnection.connect({
    address,
    // TLS configuration can be added here if needed
  });

  // Store connection reference for health checks
  temporalConnection = connection;

  // Build activities object from registry with namespaced type strings as keys
  const registry = getActivityRegistry();
  const activitiesMap: Record<
    string,
    (...args: unknown[]) => Promise<unknown>
  > = {};
  for (const [activityType, entry] of registry) {
    activitiesMap[activityType] = entry.activityFn;
  }

  // Load billing rate version context for the activity interceptor (US-007/008)
  const prisma = getPrismaClient();
  const billingWriter = new UsageEventWriter(prisma);

  // Initialize storage ledger instrumentation
  initStorageLedger(prisma);

  const billingInterceptorFactory: ActivityInterceptorsFactory = (_ctx) => {
    return {
      inbound: new ActivityBillingInterceptor(billingWriter),
    };
  };
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
    dataConverter: temporalDataConverter,
    shutdownGraceTime: "55s", // Allow 55s for in-flight activities to complete (< 70s terminationGracePeriodSeconds)
    // Concurrency limits for horizontal scaling (Group 5: HA)
    maxConcurrentActivityTaskExecutions,
    maxConcurrentWorkflowTaskExecutions,
    interceptors: {
      activity: [billingInterceptorFactory],
    },
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
      dataConverter: temporalDataConverter,
      shutdownGraceTime: "55s", // Allow 55s for in-flight activities to complete (< 70s terminationGracePeriodSeconds)
      // Concurrency limits for horizontal scaling (Group 5: HA)
      maxConcurrentActivityTaskExecutions,
      maxConcurrentWorkflowTaskExecutions,
      interceptors: {
        activity: [billingInterceptorFactory],
      },
    });
    workers.push(benchmarkWorker);

    workerLogger.info("Benchmark worker ready", {
      event: "benchmark_worker_ready",
      taskQueue: benchmarkTaskQueue,
    });
  }

  // Create billing worker for nightly storage charge and archival workflows
  const billingTaskQueue =
    process.env.BILLING_TASK_QUEUE || "billing-maintenance";
  const billingWorker = await Worker.create({
    connection,
    namespace,
    workflowsPath: require.resolve("./billing-workflows"),
    activities: {
      runNightlyStorageCharge,
      runMonthEndArchival,
    },
    taskQueue: billingTaskQueue,
    dataConverter: temporalDataConverter,
    shutdownGraceTime: "55s",
  });
  workers.push(billingWorker);

  workerLogger.info("Billing worker ready", {
    event: "billing_worker_ready",
    taskQueue: billingTaskQueue,
  });

  // Register the nightly storage charge schedule (idempotent — skips if already exists)
  await ensureNightlyStorageChargeSchedule({
    address,
    namespace,
    billingTaskQueue,
  });

  // The Temporal SDK automatically handles SIGTERM by calling worker.shutdown()
  // and worker.run() resolves once all in-flight activities have drained.
  await Promise.all(workers.map((worker) => worker.run()));

  // Only reached after all workers have fully drained.
  // Close the native connection so the underlying Rust client + tokio runtime
  // release their handles to the JS event loop. Without this the process can
  // linger after workers stop, which prevents `ts-node-dev --respawn` from
  // seeing the child exit and starting a fresh worker on file changes.
  workerLogger.info("Closing Temporal connection...", {
    event: "connection_closing",
  });
  await connection.close();
  metricsServer.close();
  workerLogger.info("Worker stopped", { event: "stopped" });
}

run()
  .then(() => {
    // Force a clean exit. The Temporal SDK installs SIGINT/SIGTERM handlers
    // that drain workers gracefully, but background timers / native handles
    // can keep the loop alive briefly afterward. A deterministic exit lets
    // ts-node-dev respawn immediately on file changes during development.
    process.exit(0);
  })
  .catch((err) => {
    workerLogger.error("Worker fatal error", {
      event: "fatal_error",
      error: err instanceof Error ? err.message : "Unknown error",
      stack: err instanceof Error ? err.stack : undefined,
      alertType: "worker_fatal",
    });
    process.exit(1);
  });
