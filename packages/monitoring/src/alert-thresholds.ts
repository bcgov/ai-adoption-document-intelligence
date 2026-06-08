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
 * Do not include a _failed or other tag on rule names. The names should remain neutral.
 *
 * Types not listed here use `DEFAULT_ALERT_THRESHOLD` when running the
 * generator with the `--include-unregistered` flag.
 */
export const ALERT_THRESHOLDS: Record<string, AlertThresholdConfig> = {
  classifier_training_submit: {
    mode: "any-error",
    severity: "warning",
    window: "5m",
    job: "backend-services",
    summary: "Classifier training submission failed",
    description: "A classifier training request failed to submit to Azure Document Intelligence within the last 5 minutes.",
  },

  classifier_training_poll: {
    mode: "any-error",
    severity: "warning",
    window: "5m",
    job: "backend-services",
    summary: "Classifier training has failed",
    description: "A classifier training job polled from Azure Document Intelligence has failed within the last 5 minutes.",
  },

  enrich_results: {
    mode: "any-error",
    severity: "critical",
    window: "5m",
    job: "temporal-worker",
    summary: "OCR enrichment activity failed",
    description: "At least one enrichment activity failed within the last 5 minutes.",
  },

  worker_fatal: {
    mode: "any-error",
    severity: "critical",
    window: "5m",
    job: "temporal-worker",
    summary: "Temporal worker process crashed",
    description: "The Temporal worker process has encountered a fatal error and exited. Document processing is halted.",
  },

  azure_ocr_submit: {
    mode: "any-error",
    severity: "warning",
    window: "5m",
    job: "temporal-worker",
    summary: "Azure OCR submission failed",
    description: "At least one document failed to be submitted to the Azure Document Intelligence OCR API within the last 5 minutes.",
  },

  azure_ocr_poll: {
    mode: "any-error",
    severity: "warning",
    window: "5m",
    job: "temporal-worker",
    summary: "Azure OCR polling failed",
    description: "At least one OCR result poll from the Azure Document Intelligence API failed within the last 5 minutes.",
  },

  azure_classify_submit: {
    mode: "any-error",
    severity: "warning",
    window: "5m",
    job: "temporal-worker",
    summary: "Azure classifier submission failed",
    description: "At least one document failed to be submitted to the Azure Document Intelligence classifier at runtime within the last 5 minutes.",
  },

  azure_classify_poll: {
    mode: "any-error",
    severity: "warning",
    window: "5m",
    job: "temporal-worker",
    summary: "Azure classifier poll failed",
    description: "At least one Azure Document Intelligence classifier poll failed within the last 5 minutes.",
  },

  mistral_ocr: {
    mode: "any-error",
    severity: "warning",
    window: "5m",
    job: "temporal-worker",
    summary: "Mistral OCR activity failed",
    description: "At least one Mistral OCR processing activity failed within the last 5 minutes.",
  },

  document_status_update: {
    mode: "any-error",
    severity: "warning",
    window: "5m",
    job: "temporal-worker",
    summary: "Document status update failed",
    description: "A document status update activity failed within the last 5 minutes, leaving a document in an incorrect state.",
  },

  upsert_ocr_result: {
    mode: "any-error",
    severity: "critical",
    window: "5m",
    job: "temporal-worker",
    summary: "OCR result persistence failed",
    description: "An OCR result could not be persisted to the database within the last 5 minutes. Processed document data may be lost.",
  },

  benchmark_materialize: {
    mode: "any-error",
    severity: "warning",
    window: "15m",
    job: "temporal-worker",
    summary: "Benchmark dataset materialization failed",
    description: "A benchmark dataset failed to materialize from object storage within the last 15 minutes.",
  },

  blob_storage: {
    mode: "any-error",
    severity: "critical",
    window: "5m",
    job: "backend-services",
    summary: "Blob storage operation failed",
    description: "A blob storage read or write operation failed within the last 5 minutes. Document storage or retrieval may be unavailable.",
  },

  document_upload: {
    mode: "any-error",
    severity: "warning",
    window: "5m",
    job: "backend-services",
    summary: "Document upload failed",
    description: "An unexpected error occurred during a document upload within the last 5 minutes.",
  },
};
