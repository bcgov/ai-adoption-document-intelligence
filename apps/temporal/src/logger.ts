/**
 * Temporal worker logging per feature-docs/007-logging-system (US-004).
 * Uses shared NDJSON logger with service name "temporal-worker".
 * Activities use createActivityLogger to attach activity name and workflowExecutionId.
 */

import { Context } from "@temporalio/activity";
import {
  createLogger,
  type LogContext,
  type Logger as SharedLogger,
} from "@ai-di/shared-logging";

const SERVICE_NAME = "temporal-worker";

export const workerLogger: SharedLogger = createLogger(SERVICE_NAME);

/**
 * Create a logger for use inside an activity. Attaches activity name and
 * workflowExecutionId (from Temporal context) to every log line.
 * Use when running inside activity code; safe to call from worker bootstrap
 * (workflowExecutionId will be omitted).
 */
export function createActivityLogger(
  activityName: string,
  context?: LogContext,
): SharedLogger {
  let workflowExecutionId: string | undefined;
  try {
    const info = Context.current?.().info;
    workflowExecutionId = info?.workflowExecution?.workflowId;
  } catch {
    // Not in an activity context (e.g. tests or worker bootstrap)
  }
  const baseContext: LogContext = {
    activity: activityName,
    ...(workflowExecutionId && { workflowExecutionId }),
    ...context,
  };
  return workerLogger.child(baseContext);
}
