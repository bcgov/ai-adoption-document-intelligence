/**
 * Shared logging module: NDJSON to stdout, LOG_LEVEL, redaction, failure fallback to stderr.
 * Does not throw on serialization or write errors.
 */

import type { LogContext, LogLevel, StructuredLogEntry } from "./types";
import { LOG_LEVELS } from "./types";

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const REDACTED_PLACEHOLDER = "[REDACTED]";
const SECRET_KEYS = new Set([
  "apiKey",
  "api_key",
  "token",
  "authorization",
  "Authorization",
  "secret",
  "password",
  "cookie",
]);

function getConfiguredLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL;
  if (raw && typeof raw === "string") {
    const level = raw.toLowerCase() as LogLevel;
    if (LOG_LEVELS.includes(level)) return level;
  }
  return "info";
}

export function getLogLevel(): LogLevel {
  return getConfiguredLevel();
}

function redactContext(context: LogContext): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    const keyLower = key.toLowerCase();
    const isSecret = SECRET_KEYS.has(key) || SECRET_KEYS.has(keyLower);
    out[key] = isSecret ? REDACTED_PLACEHOLDER : value;
  }
  return out;
}

function safeStringify(entry: StructuredLogEntry): string {
  try {
    return JSON.stringify(entry);
  } catch {
    return "";
  }
}

function writeStdout(line: string): void {
  try {
    process.stdout.write(line + "\n", (err) => {
      if (err) fallbackStderr(`stdout write failed: ${err.message}`, line);
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fallbackStderr(`stdout write threw: ${msg}`, line);
  }
}

function fallbackStderr(reason: string, originalLine: string): void {
  try {
    const fallback =
      originalLine ||
      safeStringify({
        timestamp: new Date().toISOString(),
        level: "error",
        service: "logging",
        message: reason,
      });
    process.stderr.write(
      `[logging fallback] ${reason}: ${fallback}\n`,
      () => {},
    );
  } catch {
    // Best effort only; do not throw.
  }
}

function shouldEmit(configured: LogLevel, messageLevel: LogLevel): boolean {
  return LOG_LEVEL_ORDER[messageLevel] >= LOG_LEVEL_ORDER[configured];
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(context: LogContext): Logger;
}

function emit(
  service: string,
  baseContext: LogContext | undefined,
  level: LogLevel,
  message: string,
  context?: LogContext,
): void {
  const configured = getConfiguredLevel();
  if (!shouldEmit(configured, level)) return;

  const merged: Record<string, unknown> = {
    ...redactContext(baseContext ?? {}),
    ...redactContext(context ?? {}),
  };
  const entry: StructuredLogEntry = {
    timestamp: new Date().toISOString(),
    level,
    service,
    message,
    ...merged,
  };

  const line = safeStringify(entry);
  if (line) {
    writeStdout(line);
  } else {
    fallbackStderr("serialization returned empty", message);
  }
}

export function createLogger(
  serviceName: string,
  baseContext?: LogContext,
): Logger {
  const logger: Logger = {
    debug(message: string, context?: LogContext): void {
      emit(serviceName, baseContext, "debug", message, context);
    },
    info(message: string, context?: LogContext): void {
      emit(serviceName, baseContext, "info", message, context);
    },
    warn(message: string, context?: LogContext): void {
      emit(serviceName, baseContext, "warn", message, context);
    },
    error(message: string, context?: LogContext): void {
      emit(serviceName, baseContext, "error", message, context);
    },
    child(context: LogContext): Logger {
      const childBase = { ...baseContext, ...context };
      return createLogger(serviceName, childBase);
    },
  };
  return logger;
}
