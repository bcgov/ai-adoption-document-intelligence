import { type AppMetrics, createAppMetrics } from "@ai-di/monitoring";
import type { LogLevel, MetricsHook } from "@ai-di/shared-logging";
import {
  Inject,
  Injectable,
  type OnModuleInit,
  Optional,
} from "@nestjs/common";
import {
  Counter,
  collectDefaultMetrics,
  Histogram,
  Registry,
} from "prom-client";

/**
 * Injection token for alert types to pre-initialize in MetricsService.
 * Provide this in the app module to ensure Prometheus always has a baseline
 * series before the first failure occurs, preventing increase() from returning
 * no data on the first scrape after a cold start.
 */
export const ALERT_PREFILL_TYPES = "ALERT_PREFILL_TYPES";

/**
 * Pre-initialization entry for a known alert type.
 */
export interface AlertPrefillEntry {
  alertType: string;
  severity: "warning" | "critical";
}

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly registry: Registry;
  readonly httpRequestsTotal: Counter;
  readonly httpRequestErrorsTotal: Counter;
  readonly httpRequestDurationSeconds: Histogram;
  private readonly appMetrics: AppMetrics;

  constructor(
    @Optional()
    @Inject(ALERT_PREFILL_TYPES)
    private readonly alertPrefillTypes?: AlertPrefillEntry[],
  ) {
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

    this.appMetrics = createAppMetrics(this.registry);
  }

  onModuleInit(): void {
    collectDefaultMetrics({ register: this.registry });
    // Pre-initialize known alert type series with 0 so Prometheus always has a
    // prior data point. Without this, increase() cannot compute a value on the
    // first scrape after a cold start, causing alerts to silently miss the
    // first failure event.
    for (const { alertType, severity } of this.alertPrefillTypes ?? []) {
      this.appMetrics.appErrorTotal
        .labels({ type: alertType, severity })
        .inc(0);
      this.appMetrics.appSuccessTotal.labels({ type: alertType }).inc(0);
      this.appMetrics.appAlertActive
        .labels({ type: alertType, severity })
        .set(0);
    }
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }

  /**
   * Called by the logger metrics hook. Delegates to the shared state machine.
   * @param level     The log level of the emitted line.
   * @param alertType The alert type identifier from log context.
   */
  handleLogAlert(level: LogLevel, alertType: string): void {
    this.appMetrics.handleLogAlert(level, alertType);
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
