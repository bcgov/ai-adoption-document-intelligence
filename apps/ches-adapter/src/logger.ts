type LogLevel = "info" | "error";

/**
 * Serializes a log entry as an NDJSON line to stdout, matching the
 * @ai-di/shared-logging format: { timestamp, level, service, message, ...context }.
 * @param level - Log severity level.
 * @param message - Human-readable log message.
 * @param context - Optional structured fields to include.
 */
function write(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): void {
  const stack: { stack?: string } =
    level === "error" && typeof context?.stack !== "string"
      ? { stack: new Error(message).stack }
      : {};
  const serialized: Record<string, unknown> = { ...context };
  const err = serialized.error;
  if (err instanceof Error) {
    serialized.error = err.message;
    if (typeof context?.stack !== "string" && err.stack) {
      stack.stack = err.stack;
    }
  }
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: "ches-adapter",
    message,
    ...stack,
    ...serialized,
  });
  process.stdout.write(entry + "\n");
}

export const logger = {
  /**
   * Logs an informational message as NDJSON.
   * @param message - Log message.
   * @param context - Optional structured fields.
   */
  info: (message: string, context?: Record<string, unknown>): void =>
    write("info", message, context),

  /**
   * Logs an error message as NDJSON.
   * @param message - Log message.
   * @param context - Optional structured fields.
   */
  error: (message: string, context?: Record<string, unknown>): void =>
    write("error", message, context),
};
