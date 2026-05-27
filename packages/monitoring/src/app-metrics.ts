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
 * - `app_recovery_total{type}`          — incremented on first info/debug after an error
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
  appRecoveryTotal: Counter;
  /**
   * Tracks alert types currently in an error state and their severity.
   * Used for transition detection to increment app_recovery_total on first success after error.
   */
  activeErrorTypes: Map<string, "warning" | "critical">;
  /**
   * Called by the logger metrics hook. Drives the three counters based on log level.
   *
   * warn  → app_error_total{severity="warning"}
   * error → app_error_total{severity="critical"}
   * info/debug → app_recovery_total (if was in error) + app_success_total
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

  const appRecoveryTotal = new Counter({
    name: "app_recovery_total",
    help: "Total number of application-level alert recoveries (transition from error state)",
    labelNames: ["type"] as const,
    registers: [registry],
  });

  const appSuccessTotal = new Counter({
    name: "app_success_total",
    help: "Total number of successful completions for alertable operation types. Used as denominator for error-rate alert rules.",
    labelNames: ["type"] as const,
    registers: [registry],
  });

  const activeErrorTypes = new Map<string, "warning" | "critical">();

  function handleLogAlert(level: LogLevel, alertType: string): void {
    if (level === "warn") {
      appErrorTotal.labels({ type: alertType, severity: "warning" }).inc();
      if (!activeErrorTypes.has(alertType)) {
        activeErrorTypes.set(alertType, "warning");
      }
    } else if (level === "error") {
      appErrorTotal.labels({ type: alertType, severity: "critical" }).inc();
      if (!activeErrorTypes.has(alertType)) {
        activeErrorTypes.set(alertType, "critical");
      }
    } else if (level === "info" || level === "debug") {
      if (activeErrorTypes.has(alertType)) {
        appRecoveryTotal.labels({ type: alertType }).inc();
        activeErrorTypes.delete(alertType);
      }
      appSuccessTotal.labels({ type: alertType }).inc();
    }
  }

  return {
    appErrorTotal,
    appSuccessTotal,
    appRecoveryTotal,
    activeErrorTypes,
    handleLogAlert,
  };
}
