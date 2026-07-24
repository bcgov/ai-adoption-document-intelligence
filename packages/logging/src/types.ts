/**
 * Shared log format schema and types for structured NDJSON logging.
 * Used by backend-services and temporal-worker for consistent output.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export const LOG_LEVELS: readonly LogLevel[] = [
  "debug",
  "info",
  "warn",
  "error",
] as const;

/** Optional context fields with consistent camelCase naming (per REQUIREMENTS Section 5). */
export interface LogContext {
  requestId?: string;
  sessionId?: string;
  clientIp?: string;
  workflowExecutionId?: string;
  documentId?: string;
  actorId?: string;
  activity?: string;
  event?: string;
  durationMs?: number;
  status?: string;
  error?: string;
  stack?: string;
  /**
   * When set, the metrics hook (if wired) will increment the appropriate
   * counter for this alert type based on the log level:
   * warn → app_error_total severity="warning"
   * error → app_error_total severity="critical"
   * info/debug → app_recovery_total (only when type was previously in error state)
   */
  alertType?: string;
  /** Allow additional context; known keys above are typed for tooling. */
  [key: string]: unknown;
}

/**
 * Callback invoked by the logger after each line is emitted when `alertType`
 * is present in the log context. Implementors use this to drive Prometheus
 * counters without importing metrics into application code.
 * @param level The log level of the emitted line.
 * @param alertType The value of `context.alertType`.
 */
export type MetricsHook = (level: LogLevel, alertType: string) => void;

/** Required fields plus optional context for a single NDJSON log line. */
export interface StructuredLogEntry {
  timestamp: string; // ISO 8601
  level: LogLevel;
  service: string;
  message: string;
  /** Optional context; merged from base context and per-call context. */
  [key: string]: unknown;
}
