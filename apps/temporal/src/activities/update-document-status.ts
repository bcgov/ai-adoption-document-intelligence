import { Context } from '@temporalio/activity';
import { createActivityLogger } from '../logger';
import { getPrismaClient } from './database-client';

/**
 * Activity: Update document status in database
 * Updates document status and optionally apim_request_id
 */
export async function updateDocumentStatus(params: {
  documentId: string;
  status: string;
  apimRequestId?: string;
  requestId?: string;
}): Promise<void> {
  const activityName = 'updateDocumentStatus';
  const startTime = Date.now();
  const { documentId, status, apimRequestId, requestId } = params;
  const workflowExecutionId = Context.current().info.workflowExecution?.workflowId;
  const log = createActivityLogger(activityName, {
    workflowExecutionId,
    requestId,
    documentId,
    status,
    apimRequestId,
  });

  log.info('Update document status start', { event: 'start' });

  try {
    const prisma = getPrismaClient();

    const updateData: Record<string, unknown> = {
      status: status as unknown, // Cast to DocumentStatus enum
    };

    if (apimRequestId) {
      updateData.apim_request_id = apimRequestId;
    }

    await prisma.document.update({
      where: { id: documentId },
      data: updateData,
    });

    log.info('Update document status complete', { event: 'complete' });
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('Update document status failed', {
      event: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs: duration,
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}
