/**
 * Shared application-level Prometheus metric definitions.
 *
 * Both `backend-services` and `temporal-worker` call `createAppMetrics(registry)`
 * to get an isolated set of metric instances and a `handleLogAlert` function
 * wired to them.  The caller is responsible for registering the returned
 * `registry` with its HTTP scrape endpoint.
 *
 * ## Metric inventory
 * - `app_error_total{type, severity}`   — incremented on warn/error log level
 * - `app_success_total{type}`           — incremented on info/debug log level
 *
 * Alert state is determined at query-time by Prometheus (query-time aggregation),
 * not tracked in application memory. This design works correctly across multiple
 * pod replicas without state synchronization issues.
 */

import type { LogLevel } from "@ai-di/shared-logging";
import { Counter, type Registry } from "prom-client";

export interface AppMetrics {
  appErrorTotal: Counter;
  appSuccessTotal: Counter;
  /**
   * Called by the logger metrics hook. Drives the two counters based on log level.
   *
   * warn  → app_error_total{severity="warning"}
   * error → app_error_total{severity="critical"}
   * info/debug → app_success_total
   *
   * Alert state is determined by Prometheus query-time aggregation, not in-app gauges.
   *
   * @param level     The log level of the emitted line.
   * @param alertType The alert type identifier from log context.
   */
  handleLogAlert: (level: LogLevel, alertType: string) => void;
}

/**
 * Creates and registers all application-level alert metrics into the supplied
 * Prometheus registry, then returns the metric instances and state machine.
 *
 * Call once per process — backend-services passes its NestJS-managed registry,
 * temporal-worker passes its module-level singleton registry.
 *
 * @param registry The prom-client Registry to register metrics into.
 */
export function createAppMetrics(registry: Registry): AppMetrics {
  const appErrorTotal = new Counter({
    name: "app_error_total",
    help: "Total number of application-level alertable errors by type and severity",
    labelNames: ["type", "severity"] as const,
    registers: [registry],
  });

  const appSuccessTotal = new Counter({
    name: "app_success_total",
    help: "Total number of successful completions for alertable operation types. Used as denominator for error-rate alert rules.",
    labelNames: ["type"] as const,
    registers: [registry],
  });

  function handleLogAlert(level: LogLevel, alertType: string): void {
    if (level === "warn") {
      appErrorTotal.labels({ type: alertType, severity: "warning" }).inc();
    } else if (level === "error") {
      appErrorTotal.labels({ type: alertType, severity: "critical" }).inc();
    } else if (level === "info" || level === "debug") {
      appSuccessTotal.labels({ type: alertType }).inc();
    }
  }

  return {
    appErrorTotal,
    appSuccessTotal,
    handleLogAlert,
  };
}
