/**
 * Singleton metrics instance for the Temporal worker process.
 * Registers all application-level alert metrics (counters + gauge) via the
 * shared @ai-di/monitoring package, exposed through a MetricsHook wired into
 * the shared logger — application code does not call these functions directly.
 */

import { createAppMetrics } from "@ai-di/monitoring";
import type { MetricsHook } from "@ai-di/shared-logging";
import { collectDefaultMetrics, Registry } from "prom-client";

const registry = new Registry();
collectDefaultMetrics({ register: registry });

const appMetrics = createAppMetrics(registry);

/**
 * Returns a MetricsHook callback for wiring into createLogger.
 */
export function getMetricsHook(): MetricsHook {
  return appMetrics.handleLogAlert;
}

/**
 * Returns the Prometheus registry for scraping metrics from the worker process.
 */
export function getRegistry(): Registry {
  return registry;
}
