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

/**
 * Check worker health by testing database connectivity.
 * Note: If the worker process is running, Temporal connectivity is inherently healthy
 * since the worker maintains a connection to Temporal server.
 */
async function checkWorkerHealth(): Promise<{
  status: "healthy" | "unhealthy";
  checks: {
    database: "ok" | "error";
  };
  timestamp: string;
  errors?: string[];
}> {
  const errors: string[] = [];
  const checks = {
    database: "error" as "ok" | "error",
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

  const status = checks.database === "ok" ? "healthy" : "unhealthy";

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
  metricsServer.listen(metricsPort, () => {
    workerLogger.info("Metrics and health server listening", {
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
    });
    workers.push(benchmarkWorker);

    workerLogger.info("Benchmark worker ready", {
      event: "benchmark_worker_ready",
      taskQueue: benchmarkTaskQueue,
    });
  }

  // Run all workers in parallel with graceful shutdown support
  let shutdownRequested = false;

  // Handle SIGTERM gracefully (sent by Kubernetes during pod shutdown)
  process.on("SIGTERM", () => {
    if (shutdownRequested) return;
    shutdownRequested = true;

    workerLogger.info("SIGTERM received, initiating graceful shutdown...", {
      event: "shutdown_requested",
    });

    // Shut down all workers with timeout to complete in-flight activities
    Promise.all(
      workers.map(async (worker) => {
        try {
          workerLogger.info("Shutting down worker...", {
            event: "worker_shutdown",
          });
          // shutdownGracePeriod configured in Worker.create() controls timeout
          worker.shutdown();
          workerLogger.info("Worker shut down cleanly", {
            event: "worker_shutdown_complete",
          });
        } catch (error) {
          workerLogger.error("Worker shutdown error", {
            event: "worker_shutdown_error",
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }),
    )
      .then(async () => {
        workerLogger.info("Closing Temporal connection...", {
          event: "connection_closing",
        });
        await connection.close();
        metricsServer.close();
        workerLogger.info("Shutdown complete", { event: "shutdown_complete" });
        process.exit(0);
      })
      .catch((err) => {
        workerLogger.error("Shutdown error", {
          event: "shutdown_error",
          error: err instanceof Error ? err.message : "Unknown error",
        });
        process.exit(1);
      });
  });

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
