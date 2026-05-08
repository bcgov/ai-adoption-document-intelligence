/**
 * Alert threshold configuration for application-level Prometheus alert rules.
 *
 * ## How the pieces connect
 *
 * 1. **Application code** adds `alertType` to log context when calling the shared
 *    logger (e.g. `log.warn("training failed", { alertType: "classifier_training_failed" })`).
 *
 * 2. **Shared logger** detects `alertType` and calls the registered `MetricsHook`,
 *    which drives two Prometheus counters:
 *    - `app_error_total{type, severity}` — incremented on `warn` and `error` levels.
 *    - `app_success_total{type}`         — incremented on `info` and `debug` levels.
 *    - `app_recovery_total{type}`        — incremented on `info`/`debug` only when
 *                                          the type was previously in an error state
 *                                          (transition detection).
 *
 * 3. **This file** maps each `alertType` string to a threshold configuration that
 *    controls what Prometheus alert rule expression is generated for it.
 *
 * 4. **`deployments/generate-alert-rules.ts`** reads this config and emits
 *    `deployments/local/prometheus/rules/app-alerts.yml`. Run:
 *      `npm run generate:alert-rules`
 *    after adding or changing entries here.
 *
 * ## Adding a new alertType
 *
 * 1. Add `alertType: "my_new_type"` to the relevant `log.warn` / `log.error` /
 *    `log.info` calls in application code.
 * 2. Add an entry to `ALERT_THRESHOLDS` below (or omit to use `DEFAULT_ALERT_THRESHOLD`
 *    after running the generator manually with the `--include-unregistered` flag).
 * 3. Run `npm run generate:alert-rules` to regenerate the rules YAML.
 * 4. Reload Prometheus (or restart the monitoring stack) to pick up the new rule.
 */

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
export const DEFAULT_ALERT_THRESHOLD: Omit<AlertThresholdConfig, "summary" | "description" | "job"> = {
  mode: "any-error",
  severity: "warning",
  window: "5m",
};

/**
 * Per-alertType alert rule configuration.
 *
 * Each key is an `alertType` string used in application log context.
 * The generator produces one Prometheus alert rule per entry.
 *
 * Types not listed here use `DEFAULT_ALERT_THRESHOLD` — add them here to
 * customise their threshold or switch to ratio-based alerting.
 */
export const ALERT_THRESHOLDS: Record<string, AlertThresholdConfig> = {
  classifier_training_failed: {
    mode: "error-rate",
    errorRateThreshold: 0.05,
    severity: "warning",
    window: "5m",
    job: "backend-services",
    summary: "Classifier training has failed",
    description:
      "5% of the classifier training jobs have failed within the last 5 minutes.",
  },

  enrich_results_failed: {
    mode: "any-error",
    severity: "critical",
    window: "5m",
    job: "temporal-worker",
    summary: "OCR enrichment activity failed",
    description:
      "At least one enrichment activity failed within the last 5 minutes.",
  },
};

// ---------------------------------------------------------------------------
// Static application-level alert rules
// These are fixed expressions over existing metrics (HTTP, heap, app_alert_active).
// Thresholds are exported here so they can be referenced by values.yaml comments
// and kept in one place without editing generated YAML directly.
// ---------------------------------------------------------------------------

export interface StaticAlertRule {
  /** Alert name in PascalCase. */
  name: string;
  /** Prometheus expression. */
  expr: string;
  /** How long the condition must hold before firing. */
  forDuration: string;
  /** Severity label value. */
  severity: "info" | "warning" | "critical";
  /** Short summary annotation. */
  summary: string;
  /** Detailed description annotation. */
  description: string;
}

/** HTTP error rate threshold — alerts when this many errors/sec is exceeded. */
export const HTTP_ERROR_RATE_THRESHOLD = 0.1;

/** p95 latency threshold in seconds — alerts when exceeded. */
export const HTTP_P95_LATENCY_THRESHOLD_S = 5;

/** Node.js heap ratio threshold (0–1) — alerts when heap used / heap size exceeds this. */
export const NODE_HEAP_RATIO_THRESHOLD = 0.9;

export const STATIC_ALERT_RULES: StaticAlertRule[] = [
  {
    name: "HighHttpErrorRate",
    expr: `rate(http_request_errors_total[5m]) > ${HTTP_ERROR_RATE_THRESHOLD}`,
    forDuration: "2m",
    severity: "warning",
    summary: "High HTTP error rate on backend-services",
    description: `The HTTP error rate has exceeded ${HTTP_ERROR_RATE_THRESHOLD} errors/sec for 2 minutes.`,
  },
  {
    name: "SlowHttpResponses",
    expr: `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > ${HTTP_P95_LATENCY_THRESHOLD_S}`,
    forDuration: "2m",
    severity: "warning",
    summary: "Slow HTTP responses on backend-services",
    description: `p95 HTTP response latency has exceeded ${HTTP_P95_LATENCY_THRESHOLD_S}s for 2 minutes.`,
  },
  {
    name: "HighNodeHeapUsage",
    expr: `process_heap_bytes / process_heap_size_bytes > ${NODE_HEAP_RATIO_THRESHOLD}`,
    forDuration: "2m",
    severity: "warning",
    summary: "High Node.js heap usage on backend-services",
    description: `Node.js heap usage has exceeded ${NODE_HEAP_RATIO_THRESHOLD * 100}% of heap size for 2 minutes.`,
  },
  {
    name: "AppAlertActive",
    expr: `app_alert_active > 0`,
    forDuration: "0m",
    severity: "warning",
    summary: "In-app alert flag is active ({{ $labels.type }}, {{ $labels.severity }})",
    description:
      "An in-app alert of type {{ $labels.type }} with severity {{ $labels.severity }} has been raised via recordAlert().",
  },
];
