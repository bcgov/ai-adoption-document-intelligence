/**
 * Singleton metrics instance for the Temporal worker process.
 * Provides app_error_total and app_recovery_total counters exposed via
 * a MetricsHook that is wired into the shared logger — application code
 * does not call these functions directly.
 */
import type { LogLevel, MetricsHook } from "@ai-di/shared-logging";
import { Counter, Registry } from "prom-client";

const registry = new Registry();

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

/** Tracks alert types currently in an error state for transition detection. */
const activeErrorTypes = new Set<string>();

/**
 * Called by the logger metrics hook. Increments the appropriate counter
 * based on log level and tracks error state transitions.
 * warn  → app_error_total{severity="warning"} + marks type as errored
 * error → app_error_total{severity="critical"} + marks type as errored
 * info/debug → app_recovery_total if type was previously in error state
 * @param level The log level of the emitted line.
 * @param alertType The alert type identifier from log context.
 */
function handleLogAlert(level: LogLevel, alertType: string): void {
  if (level === "warn") {
    appErrorTotal.labels({ type: alertType, severity: "warning" }).inc();
    activeErrorTypes.add(alertType);
  } else if (level === "error") {
    appErrorTotal.labels({ type: alertType, severity: "critical" }).inc();
    activeErrorTypes.add(alertType);
  } else if (level === "info" || level === "debug") {
    if (activeErrorTypes.has(alertType)) {
      appRecoveryTotal.labels({ type: alertType }).inc();
      activeErrorTypes.delete(alertType);
    }
    appSuccessTotal.labels({ type: alertType }).inc();
  }
}

/**
 * Returns a MetricsHook callback for wiring into createLogger.
 */
export function getMetricsHook(): MetricsHook {
  return handleLogAlert;
}

/**
 * Returns the Prometheus registry for scraping metrics from the worker process.
 */
export function getRegistry(): Registry {
  return registry;
}
