/**
 * Temporal Runtime logger that forwards all SDK log output (TypeScript and native)
 * to the shared NDJSON logger so that feature-docs/007-logging-system is satisfied:
 * one format, LOG_LEVEL respected, no separate SDK format on stdout.
 */

import type { LogContext } from "@ai-di/shared-logging";
import { getLogLevel } from "@ai-di/shared-logging";
import type { LogLevel as TemporalLogLevel } from "@temporalio/common";
import type { LogEntry } from "@temporalio/worker";
import {
  DefaultLogger,
  makeTelemetryFilterString,
  Runtime,
} from "@temporalio/worker";
import { workerLogger } from "./logger";

const SHARED_TO_TEMPORAL_LEVEL: Record<string, TemporalLogLevel> = {
  debug: "DEBUG",
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
};

function sharedLevelToTemporal(): TemporalLogLevel {
  const level = getLogLevel();
  return SHARED_TO_TEMPORAL_LEVEL[level] ?? "INFO";
}

function metaToContext(meta: LogEntry["meta"]): LogContext {
  if (meta == null || typeof meta !== "object") {
    return {};
  }
  const context: LogContext = {};
  for (const [key, value] of Object.entries(meta)) {
    if (key === "error" && value instanceof Error) {
      context.error = value.message;
      context.stack = value.stack;
    } else if (typeof key === "string") {
      context[key] = value;
    }
  }
  return context;
}

/** SDK messages that represent failures; we log these as error for platform semantics (007). */
const FAILURE_MESSAGES = new Set(["Activity failed", "Workflow failed"]);

function createSdkLogFunction(): (entry: LogEntry) => void {
  return (entry: LogEntry) => {
    const context = metaToContext(entry.meta);
    const useError = FAILURE_MESSAGES.has(entry.message);
    const level = useError
      ? "error"
      : (entry.level.toLowerCase() as
          | "trace"
          | "debug"
          | "info"
          | "warn"
          | "error");
    switch (level) {
      case "trace":
      case "debug":
        workerLogger.debug(entry.message, context);
        break;
      case "info":
        workerLogger.info(entry.message, context);
        break;
      case "warn":
        workerLogger.warn(entry.message, context);
        break;
      case "error":
        workerLogger.error(entry.message, context);
        break;
      default:
        workerLogger.info(entry.message, context);
    }
  };
}

/**
 * Install the Temporal Runtime with a logger that forwards all SDK messages
 * (TypeScript and native "Activity failed" / "Workflow failed" etc.) to the
 * shared NDJSON logger. Must be called once before any Worker.create() or
 * NativeConnection.connect().
 */
export function installTemporalRuntimeLogger(): void {
  const level = sharedLevelToTemporal();
  const logger = new DefaultLogger(level, createSdkLogFunction());
  Runtime.install({
    logger,
    telemetryOptions: {
      logging: {
        filter: makeTelemetryFilterString({ core: "WARN", other: "ERROR" }),
        forward: {},
      },
    },
  });
}
