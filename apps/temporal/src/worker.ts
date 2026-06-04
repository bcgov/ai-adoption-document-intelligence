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
import { getPrismaClient } from "./activities/database-client";
import { getActivityRegistry } from "./activity-registry";
import { workerLogger } from "./logger";
import { getRegistry } from "./metrics";
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

  // Create workers array to track all running workers
  const workers: Worker[] = [];

  // Create primary worker for production OCR processing
  const ocrWorker = await Worker.create({
    connection,
    namespace,
    workflowsPath: require.resolve("./graph-workflow"),
    activities: activitiesMap,
    taskQueue,
    shutdownGraceTime: "55s", // Allow 55s for in-flight activities to complete (< 70s terminationGracePeriodSeconds)
    // Concurrency limits for horizontal scaling (Group 5: HA)
    maxConcurrentActivityTaskExecutions,
    maxConcurrentWorkflowTaskExecutions,
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
      shutdownGraceTime: "55s", // Allow 55s for in-flight activities to complete (< 70s terminationGracePeriodSeconds)
      // Concurrency limits for horizontal scaling (Group 5: HA)
      maxConcurrentActivityTaskExecutions,
      maxConcurrentWorkflowTaskExecutions,
    });
    workers.push(benchmarkWorker);

    workerLogger.info("Benchmark worker ready", {
      event: "benchmark_worker_ready",
      taskQueue: benchmarkTaskQueue,
    });
  }

  // The Temporal SDK automatically handles SIGTERM by calling worker.shutdown()
  // and worker.run() resolves once all in-flight activities have drained.
  await Promise.all(workers.map((worker) => worker.run()));

  // Only reached after all workers have fully drained
  workerLogger.info("Closing Temporal connection...", {
    event: "connection_closing",
  });
  await connection.close();
  metricsServer.close();
  workerLogger.info("Worker stopped", { event: "stopped" });
}

run().catch((err) => {
  workerLogger.error("Worker fatal error", {
    event: "fatal_error",
    error: err instanceof Error ? err.message : "Unknown error",
    stack: err instanceof Error ? err.stack : undefined,
    alertType: "worker_fatal",
  });
  process.exit(1);
});
