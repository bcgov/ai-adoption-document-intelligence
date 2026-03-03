/**
 * Shared logger for temporal-worker. Use createLogger('temporal-worker') for process-level logs.
 * Activities should use createActivityLogger(activityName, workflowExecutionId, requestId) for scoped logs.
 */
import { createLogger } from '@ai-di/shared-logging';

export const workerLogger = createLogger('temporal-worker');

export function createActivityLogger(
  activityName: string,
  context: { workflowExecutionId?: string; requestId?: string; [key: string]: unknown },
): ReturnType<typeof createLogger> {
  return workerLogger.child({
    activity: activityName,
    ...context,
  });
}
