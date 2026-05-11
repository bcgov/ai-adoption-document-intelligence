import type { LogLevel, MetricsHook } from "@ai-di/shared-logging";
import { Injectable, type OnModuleInit } from "@nestjs/common";
import {
  Counter,
  collectDefaultMetrics,
  Gauge,
  Histogram,
  Registry,
} from "prom-client";

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly registry: Registry;
  readonly httpRequestsTotal: Counter;
  readonly httpRequestErrorsTotal: Counter;
  readonly httpRequestDurationSeconds: Histogram;
  private readonly appErrorTotal: Counter;
  private readonly appRecoveryTotal: Counter;
  private readonly appSuccessTotal: Counter;
  private readonly appAlertActive: Gauge;
  /**
   * Tracks alert types currently in an error state and their severity.
   * Used for transition detection and to clear the correct gauge label set on recovery.
   */
  private readonly activeErrorTypes = new Map<string, "warning" | "critical">();

  constructor() {
    this.registry = new Registry();

    this.httpRequestsTotal = new Counter({
      name: "http_requests_total",
      help: "Total number of HTTP requests",
      labelNames: ["method", "path", "status_code"] as const,
      registers: [this.registry],
    });

    this.httpRequestErrorsTotal = new Counter({
      name: "http_request_errors_total",
      help: "Total number of HTTP requests resulting in 4xx or 5xx status codes",
      labelNames: ["method", "path", "status_code"] as const,
      registers: [this.registry],
    });

    this.httpRequestDurationSeconds = new Histogram({
      name: "http_request_duration_seconds",
      help: "Duration of HTTP requests in seconds",
      labelNames: ["method", "path"] as const,
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.appErrorTotal = new Counter({
      name: "app_error_total",
      help: "Total number of application-level alertable errors by type and severity",
      labelNames: ["type", "severity"] as const,
      registers: [this.registry],
    });

    this.appRecoveryTotal = new Counter({
      name: "app_recovery_total",
      help: "Total number of application-level alert recoveries (transition from error state)",
      labelNames: ["type"] as const,
      registers: [this.registry],
    });

    this.appSuccessTotal = new Counter({
      name: "app_success_total",
      help: "Total number of successful completions for alertable operation types. Used as denominator for error-rate alert rules.",
      labelNames: ["type"] as const,
      registers: [this.registry],
    });

    this.appAlertActive = new Gauge({
      name: "app_alert_active",
      help: "1 while an in-app alert of the given type is active, 0 when resolved. Set by the logging hook on warn/error; cleared on info/debug (recovery transition).",
      labelNames: ["type", "severity"] as const,
      registers: [this.registry],
    });
  }

  onModuleInit(): void {
    collectDefaultMetrics({ register: this.registry });
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }

  /**
   * Called by the logger metrics hook. Increments the appropriate counter
   * based on log level and tracks error state transitions.
   * warn  → app_error_total{severity="warning"} + marks type as errored
   * error → app_error_total{severity="critical"} + marks type as errored
   * info/debug → app_recovery_total if type was previously in error state
   * @param level The log level of the emitted line.
   * @param alertType The alert type identifier from log context.
   */
  handleLogAlert(level: LogLevel, alertType: string): void {
    if (level === "warn") {
      this.appErrorTotal.labels({ type: alertType, severity: "warning" }).inc();
      if (!this.activeErrorTypes.has(alertType)) {
        this.appAlertActive
          .labels({ type: alertType, severity: "warning" })
          .set(1);
        this.activeErrorTypes.set(alertType, "warning");
      }
    } else if (level === "error") {
      this.appErrorTotal
        .labels({ type: alertType, severity: "critical" })
        .inc();
      if (!this.activeErrorTypes.has(alertType)) {
        this.appAlertActive
          .labels({ type: alertType, severity: "critical" })
          .set(1);
        this.activeErrorTypes.set(alertType, "critical");
      }
    } else if (level === "info" || level === "debug") {
      const activeSeverity = this.activeErrorTypes.get(alertType);
      if (activeSeverity !== undefined) {
        this.appAlertActive
          .labels({ type: alertType, severity: activeSeverity })
          .set(0);
        this.appRecoveryTotal.labels({ type: alertType }).inc();
        this.activeErrorTypes.delete(alertType);
      }
      this.appSuccessTotal.labels({ type: alertType }).inc();
    }
  }

  /**
   * Returns a MetricsHook callback bound to this service instance,
   * suitable for passing to createLogger.
   */
  getMetricsHook(): MetricsHook {
    return (level: LogLevel, alertType: string) =>
      this.handleLogAlert(level, alertType);
  }
}
