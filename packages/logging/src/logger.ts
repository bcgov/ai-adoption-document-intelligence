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

function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development";
}

/** When set (e.g. LOG_PRETTY_CONTEXT=1), context is pretty-printed on multiple lines in dev. */
function isPrettyContextEnabled(): boolean {
  const v = process.env.LOG_PRETTY_CONTEXT;
  if (v === undefined || v === "") return false;
  return ["1", "true", "yes"].includes(v.toLowerCase());
}

/** ANSI colors for pretty dev output; no-op when stdout is not a TTY. */
const TTY = typeof process.stdout.isTTY === "boolean" && process.stdout.isTTY;
const reset = TTY ? "\x1b[0m" : "";
const secondary = TTY ? "\x1b[90m" : ""; // bright gray (visible on dark/light)
const levelColors: Record<LogLevel, string> = TTY
  ? {
      debug: "\x1b[32m", // green
      info: "\x1b[36m", // cyan
      warn: "\x1b[33m", // yellow
      error: "\x1b[31m\x1b[1m", // red bold
    }
  : { debug: "", info: "", warn: "", error: "" };
const serviceColor = TTY ? "\x1b[35m" : ""; // magenta
const contextColor = TTY ? "\x1b[90m" : ""; // bright gray

/** Human-readable format with spacing and optional colors when NODE_ENV=development. */
function formatPretty(
  timestamp: string,
  level: LogLevel,
  service: string,
  message: string,
  merged: Record<string, unknown>,
): string {
  const levelLabel = level.toUpperCase().padEnd(5);
  const timePart = `${secondary}[${timestamp}]${reset}`;
  const levelPart = `${levelColors[level]}${levelLabel}${reset}`;
  const servicePart = `${serviceColor}${service}${reset}`;
  let contextStr = "";
  if (Object.keys(merged).length > 0) {
    if (isPrettyContextEnabled()) {
      const prettyJson = JSON.stringify(merged, null, 2);
      const indented = prettyJson.split("\n").map((l) => "  " + l).join("\n");
      contextStr = `\n${contextColor}${indented}${reset}`;
    } else {
      contextStr = `  ${contextColor}${JSON.stringify(merged)}${reset}`;
    }
  }
  return `${timePart}  ${levelPart}  ${servicePart}  ${message}${contextStr}`;
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
  const timestamp = new Date().toISOString();

  const line = isDevelopment()
    ? formatPretty(timestamp, level, service, message, merged)
    : safeStringify({
        timestamp,
        ...merged,
        level,
        service,
        message,
      } as StructuredLogEntry);

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
