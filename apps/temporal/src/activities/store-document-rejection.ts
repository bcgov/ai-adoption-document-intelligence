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
}): Promise<void> {
  const activityName = 'storeDocumentRejection';
  const { documentId, reason, reviewer, annotations } = params;
  const startTime = Date.now();

  console.log(JSON.stringify({
    activity: activityName,
    event: 'start',
    documentId,
    reason,
    reviewer,
    hasAnnotations: !!annotations,
    timestamp: new Date().toISOString()
  }));

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

    console.log(JSON.stringify({
      activity: activityName,
      event: 'complete',
      documentId,
      reason,
      timestamp: new Date().toISOString()
    }));
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(JSON.stringify({
      activity: activityName,
      event: 'error',
      documentId,
      reason,
      error: errorMessage,
      durationMs: duration,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    }));
    throw error;
  }
}
