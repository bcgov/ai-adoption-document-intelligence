/**
 * Static (infrastructure-level) Prometheus alert rules.
 *
 * These cover metrics that are emitted by any Node.js service instrumented with
 * prom-client: HTTP error rate, response latency, and heap usage. Temporal 
 * workers that expose the same metrics can reference these rules directly 
 * without duplicating threshold constants.
 *
 * Rules specific to a single service should be added to STATIC_ALERT_RULES with
 * a descriptive `name` and narrowed `expr` (e.g. filtered by `job` label).
 */

export interface StaticAlertRule {
  /** Alert name in PascalCase. */
  name: string;
  /** Prometheus expression. */
  expr: string;
  /** How long the condition must hold before firing. */
  forDuration: string;
  /** Severity label value ("info", "warning", or "critical"). */
  severity: "info" | "warning" | "critical";
  /**
   * Prometheus scrape job this rule belongs to.
   * Controls which static rule group the alert is placed in by the generator.
   * Omit only for rules that intentionally span all jobs.
   */
  job?: "backend-services" | "temporal-worker";
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
    job: "backend-services",
    expr: `rate(http_request_errors_total[5m]) > ${HTTP_ERROR_RATE_THRESHOLD}`,
    forDuration: "2m",
    severity: "warning",
    summary: "High HTTP error rate on backend-services",
    description: `The HTTP error rate has exceeded ${HTTP_ERROR_RATE_THRESHOLD} errors/sec for 2 minutes.`,
  },
  {
    name: "SlowHttpResponses",
    job: "backend-services",
    expr: `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > ${HTTP_P95_LATENCY_THRESHOLD_S}`,
    forDuration: "2m",
    severity: "warning",
    summary: "Slow HTTP responses on backend-services",
    description: `p95 HTTP response latency has exceeded ${HTTP_P95_LATENCY_THRESHOLD_S}s for 2 minutes.`,
  },
  {
    name: "HighNodeHeapUsage",
    job: "backend-services",
    expr: `process_heap_bytes / process_heap_size_bytes > ${NODE_HEAP_RATIO_THRESHOLD}`,
    forDuration: "2m",
    severity: "warning",
    summary: "High Node.js heap usage on backend-services",
    description: `Node.js heap usage has exceeded ${NODE_HEAP_RATIO_THRESHOLD * 100}% of heap size for 2 minutes.`,
  },
];
