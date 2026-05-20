/** Two alert expression modes. */
export type AlertMode =
  /**
   * Fire on any single error within the evaluation window.
   * Prometheus expression: `increase(app_error_total{type="..."}[window]) > 0`
   * Best for zero-tolerance operations (e.g. classifier training, critical jobs).
   */
  | "any-error"
  /**
   * Fire when the error/(error+success) ratio exceeds a threshold.
   * Prometheus expression:
   *   `rate(app_error_total{type="..."}[window])
   *    / (rate(app_error_total{type="..."}[window]) + rate(app_success_total{type="..."}[window]))
   *    > errorRateThreshold`
   * Best for high-throughput operations where occasional errors are expected.
   */
  | "error-rate";

export interface AlertThresholdConfig {
  /** Alert expression mode. */
  mode: AlertMode;
  /**
   * Error rate threshold (0–1). Required when mode is "error-rate".
   * E.g. `0.01` = alert when more than 1% of operations fail.
   */
  errorRateThreshold?: number;
  /**
   * Prometheus evaluation window. Defaults to "5m".
   * Use a longer window (e.g. "15m") for low-frequency operations to avoid
   * false positives from rate() returning 0 when there is no data.
   */
  window?: string;
  /** Alert severity label. Inherited by the firing alert in Prometheus/Alertmanager. */
  severity: "warning" | "critical";
  /**
   * Prometheus scrape job this alert belongs to.
   * Must match the `job_name` in prometheus.yml.
   * Controls which rule group the alert is placed in.
   */
  job: "backend-services" | "temporal-worker";
  /** Human-readable alert summary (appears in Prometheus/Grafana alert annotations). */
  summary: string;
  /** Detailed description for the alert annotation. */
  description: string;
}

/**
 * Default threshold applied to alertTypes not explicitly listed in `ALERT_THRESHOLDS`.
 * Intentionally zero-tolerance: any single error fires an alert.
 * This is the safest default — operators can relax thresholds for specific types
 * by adding an entry to `ALERT_THRESHOLDS`.
 */
export const DEFAULT_ALERT_THRESHOLD: Omit<
  AlertThresholdConfig,
  "summary" | "description" | "job"
> = {
  mode: "any-error",
  severity: "warning",
  window: "5m",
};

/**
 * Per-alertType alert rule configuration.
 *
 * Each key is an `alertType` string used in application log context.
 * The Prometheus rule generator produces one alert rule per entry.
 *
 * Types not listed here use `DEFAULT_ALERT_THRESHOLD` when running the
 * generator with the `--include-unregistered` flag.
 */
export const ALERT_THRESHOLDS: Record<string, AlertThresholdConfig> = {
  classifier_training_failed: {
    mode: "any-error",
    severity: "warning",
    window: "5m",
    job: "backend-services",
    summary: "Classifier training has failed",
    description: "A classifier training job has failed within the last 5 minutes.",
  },

  enrich_results_failed: {
    mode: "any-error",
    severity: "critical",
    window: "5m",
    job: "temporal-worker",
    summary: "OCR enrichment activity failed",
    description: "At least one enrichment activity failed within the last 5 minutes.",
  },
};
