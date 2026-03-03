import { Context } from '@temporalio/activity';
import { createActivityLogger } from '../logger';
import { getPrismaClient } from './database-client';

/**
 * Activity: Store document rejection data
 * Stores rejection reason, annotations, and reviewer information
 */
export async function storeDocumentRejection(params: {
  documentId: string;
  reason: string;
  reviewer?: string;
  annotations?: string;
  requestId?: string;
}): Promise<void> {
  const activityName = 'storeDocumentRejection';
  const { documentId, reason, reviewer, annotations, requestId } = params;
  const workflowExecutionId = Context.current().info.workflowExecution?.workflowId;
  const log = createActivityLogger(activityName, { workflowExecutionId, requestId, documentId });
  const startTime = Date.now();

  log.info('Store document rejection start', {
    event: 'start',
    reason,
    reviewer,
    hasAnnotations: !!annotations,
  });

  try {
    const prisma = getPrismaClient();
    // documentRejection: add DocumentRejection model to shared prisma schema and run migration when ready
    await (prisma as any).documentRejection.upsert({
      where: { document_id: documentId },
      update: {
        reason: reason as unknown,
        reviewer: reviewer || null,
        annotations: annotations || null,
      },
      create: {
        document_id: documentId,
        reason: reason as unknown,
        reviewer: reviewer || null,
        annotations: annotations || null,
      },
    });

    log.info('Store document rejection complete', {
      event: 'complete',
      reason,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const stack = error instanceof Error ? error.stack : undefined;
    log.error('Store document rejection error', {
      event: 'error',
      reason,
      error: errorMessage,
      durationMs: duration,
      stack,
    });
    throw error;
  }
}
