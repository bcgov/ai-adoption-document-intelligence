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
export const DEFAULT_ALERT_THRESHOLD: Omit<AlertThresholdConfig, "summary" | "description"> = {
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
    summary: "Classifier training has failed",
    description:
      "5% of the classifier training jobs have failed within the last 5 minutes.",
  },

  enrich_results_failed: {
    mode: "any-error",
    severity: "critical",
    window: "5m",
    summary: "OCR enrichment activity failed",
    description:
      "At least one enrichment activity failed within the last 5 minutes.",
  },
};
