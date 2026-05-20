/**
 * Shared application-level Prometheus metric definitions and alert state machine.
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
 * - `app_alert_active{type, severity}`  — gauge: 1 while an alert is active, 0 on recovery
 */

import type { LogLevel } from "@ai-di/shared-logging";
import { Counter, Gauge, type Registry } from "prom-client";

export interface AppMetrics {
  appErrorTotal: Counter;
  appSuccessTotal: Counter;
  appRecoveryTotal: Counter;
  appAlertActive: Gauge;
  /**
   * Tracks alert types currently in an error state and their severity.
   * Used for transition detection and to clear the correct gauge label set on recovery.
   */
  activeErrorTypes: Map<string, "warning" | "critical">;
  /**
   * Called by the logger metrics hook. Drives the four metrics based on log level.
   *
   * warn  → app_error_total{severity="warning"}  + sets app_alert_active=1 on first occurrence
   * error → app_error_total{severity="critical"} + sets app_alert_active=1 on first occurrence
   * info/debug → app_recovery_total + app_alert_active=0 + app_success_total  (if was in error)
   *           → app_success_total only (if not previously in error)
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

  const appAlertActive = new Gauge({
    name: "app_alert_active",
    help: "1 while an in-app alert of the given type is active, 0 when resolved. Set by the logging hook on warn/error; cleared on info/debug (recovery transition).",
    labelNames: ["type", "severity"] as const,
    registers: [registry],
  });

  const activeErrorTypes = new Map<string, "warning" | "critical">();

  function handleLogAlert(level: LogLevel, alertType: string): void {
    if (level === "warn") {
      appErrorTotal.labels({ type: alertType, severity: "warning" }).inc();
      if (!activeErrorTypes.has(alertType)) {
        appAlertActive.labels({ type: alertType, severity: "warning" }).set(1);
        activeErrorTypes.set(alertType, "warning");
      }
    } else if (level === "error") {
      appErrorTotal.labels({ type: alertType, severity: "critical" }).inc();
      if (!activeErrorTypes.has(alertType)) {
        appAlertActive.labels({ type: alertType, severity: "critical" }).set(1);
        activeErrorTypes.set(alertType, "critical");
      }
    } else if (level === "info" || level === "debug") {
      const activeSeverity = activeErrorTypes.get(alertType);
      if (activeSeverity !== undefined) {
        appAlertActive.labels({ type: alertType, severity: activeSeverity }).set(0);
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
    appAlertActive,
    activeErrorTypes,
    handleLogAlert,
  };
}
