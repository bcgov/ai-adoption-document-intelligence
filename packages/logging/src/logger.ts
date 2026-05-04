/**
 * Shared logging module: NDJSON to stdout, LOG_LEVEL, redaction, failure fallback to stderr.
 * Does not throw on serialization or write errors.
 */

import type { LogContext, LogLevel, StructuredLogEntry } from "./types";
import { LOG_LEVELS } from "./types";

/** Node `process` when present; undefined in browser / Temporal workflow sandbox (no throws on load). */
function nodeProcess(): NodeJS.Process | undefined {
  return typeof process !== "undefined" ? process : undefined;
}

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

const RESERVED_CONTEXT_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

function getConfiguredLevel(): LogLevel {
  const raw = nodeProcess()?.env.LOG_LEVEL;
  if (raw && typeof raw === "string") {
    const level = raw.toLowerCase() as LogLevel;
    if (LOG_LEVELS.includes(level)) return level;
  }
  return "info";
}

export function getLogLevel(): LogLevel {
  return getConfiguredLevel();
}

/** Redacted context as a Map so merges avoid dynamic writes to plain objects (CodeQL). */
function contextToRedactedMap(
  context: LogContext | undefined,
): Map<string, unknown> {
  const out = new Map<string, unknown>();
  if (context === undefined) {
    return out;
  }
  for (const [key, value] of Object.entries(context)) {
    if (RESERVED_CONTEXT_KEYS.has(key)) {
      continue;
    }
    const keyLower = key.toLowerCase();
    const isSecret = SECRET_KEYS.has(key) || SECRET_KEYS.has(keyLower);
    out.set(key, isSecret ? REDACTED_PLACEHOLDER : value);
  }
  return out;
}

function mergeRedactedMaps(
  base: Map<string, unknown>,
  extra: Map<string, unknown>,
): Map<string, unknown> {
  const merged = new Map(base);
  for (const [k, v] of extra) {
    merged.set(k, v);
  }
  return merged;
}

/** NDJSON line without spreading user keys onto a plain object. */
function stringifyNdjsonLine(
  timestamp: string,
  level: LogLevel,
  service: string,
  message: string,
  merged: Map<string, unknown>,
): string {
  const chunks: string[] = [
    `"timestamp":${JSON.stringify(timestamp)}`,
    `"level":${JSON.stringify(level)}`,
    `"service":${JSON.stringify(service)}`,
    `"message":${JSON.stringify(message)}`,
  ];
  for (const [k, v] of merged) {
    let encoded: string;
    try {
      encoded = JSON.stringify(v);
    } catch {
      encoded = "null";
    }
    chunks.push(`${JSON.stringify(k)}:${encoded}`);
  }
  return `{${chunks.join(",")}}`;
}

function safeStringify(entry: StructuredLogEntry): string {
  try {
    return JSON.stringify(entry);
  } catch {
    return "";
  }
}

function writeStdout(line: string): void {
  const proc = nodeProcess();
  if (proc?.stdout == null) {
    return;
  }
  try {
    proc.stdout.write(line + "\n", (err) => {
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
    const proc = nodeProcess();
    if (proc?.stderr == null) {
      return;
    }
    proc.stderr.write(`[logging fallback] ${reason}: ${fallback}\n`, () => {});
  } catch {
    // Best effort only; do not throw.
  }
}

function shouldEmit(configured: LogLevel, messageLevel: LogLevel): boolean {
  return LOG_LEVEL_ORDER[messageLevel] >= LOG_LEVEL_ORDER[configured];
}

function isDevelopment(): boolean {
  return nodeProcess()?.env.NODE_ENV === "development";
}

/** When set (e.g. LOG_PRETTY_CONTEXT=1), context is pretty-printed on multiple lines in dev. */
function isPrettyContextEnabled(): boolean {
  const v = nodeProcess()?.env.LOG_PRETTY_CONTEXT;
  if (v === undefined || v === "") return false;
  return ["1", "true", "yes"].includes(v.toLowerCase());
}

/** ANSI colors for pretty dev output; no-op when stdout is not a TTY or not in Node. */
function isStdoutTty(): boolean {
  const proc = nodeProcess();
  return (
    proc !== undefined &&
    typeof proc.stdout.isTTY === "boolean" &&
    proc.stdout.isTTY
  );
}

const TTY = isStdoutTty();
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
  merged: Map<string, unknown>,
): string {
  const levelLabel = level.toUpperCase().padEnd(5);
  const timePart = `${secondary}[${timestamp}]${reset}`;
  const levelPart = `${levelColors[level]}${levelLabel}${reset}`;
  const servicePart = `${serviceColor}${service}${reset}`;
  let contextStr = "";
  if (merged.size > 0) {
    if (isPrettyContextEnabled()) {
      const inner = Array.from(merged.entries())
        .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v, null, 2)}`)
        .join(",\n");
      contextStr = `\n${contextColor}{\n${inner}\n}${reset}`;
    } else {
      const compact = `{${Array.from(merged.entries())
        .map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`)
        .join(",")}}`;
      contextStr = `  ${contextColor}${compact}${reset}`;
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

function emitWithBaseMap(
  service: string,
  baseMap: Map<string, unknown>,
  level: LogLevel,
  message: string,
  context?: LogContext,
): void {
  const configured = getConfiguredLevel();
  if (!shouldEmit(configured, level)) return;

  const merged = mergeRedactedMaps(
    baseMap,
    contextToRedactedMap(context ?? {}),
  );
  const timestamp = new Date().toISOString();

  const line = isDevelopment()
    ? formatPretty(timestamp, level, service, message, merged)
    : stringifyNdjsonLine(timestamp, level, service, message, merged);

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
  return createLoggerFromBaseMap(
    serviceName,
    contextToRedactedMap(baseContext),
  );
}

function createLoggerFromBaseMap(
  serviceName: string,
  baseMap: Map<string, unknown>,
): Logger {
  const logger: Logger = {
    debug(message: string, context?: LogContext): void {
      emitWithBaseMap(serviceName, baseMap, "debug", message, context);
    },
    info(message: string, context?: LogContext): void {
      emitWithBaseMap(serviceName, baseMap, "info", message, context);
    },
    warn(message: string, context?: LogContext): void {
      emitWithBaseMap(serviceName, baseMap, "warn", message, context);
    },
    error(message: string, context?: LogContext): void {
      emitWithBaseMap(serviceName, baseMap, "error", message, context);
    },
    child(context: LogContext): Logger {
      const nextBase = mergeRedactedMaps(
        baseMap,
        contextToRedactedMap(context),
      );
      return createLoggerFromBaseMap(serviceName, nextBase);
    },
  };
  return logger;
}
