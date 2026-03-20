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
  userId?: string;
  activity?: string;
  event?: string;
  durationMs?: number;
  status?: string;
  error?: string;
  stack?: string;
  /** Allow additional context; known keys above are typed for tooling. */
  [key: string]: unknown;
}

/** Required fields plus optional context for a single NDJSON log line. */
export interface StructuredLogEntry {
  timestamp: string; // ISO 8601
  level: LogLevel;
  service: string;
  message: string;
  /** Optional context; merged from base context and per-call context. */
  [key: string]: unknown;
}
