import { getPrismaClient } from './database-client';

/**
 * Activity: Update document status in database
 * Updates document status and optionally apim_request_id
 */
export async function updateDocumentStatus(params: {
  documentId: string;
  status: string;
  apimRequestId?: string;
}): Promise<void> {
  const activityName = 'updateDocumentStatus';
  const startTime = Date.now();
  const { documentId, status, apimRequestId } = params;

  console.log(JSON.stringify({
    activity: activityName,
    event: 'start',
    documentId,
    status,
    apimRequestId,
    timestamp: new Date().toISOString()
  }));

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

    console.log(JSON.stringify({
      activity: activityName,
      event: 'complete',
      documentId,
      status,
      timestamp: new Date().toISOString()
    }));
  } catch (error) {
    const duration = Date.now() - startTime;

    // P2025 = record not found. In benchmark mode, documents don't exist in the
    // database so the update is expected to find nothing. Log and move on.
    if (
      error instanceof Error &&
      'code' in error &&
      (error as { code: string }).code === 'P2025'
    ) {
      console.log(JSON.stringify({
        activity: activityName,
        event: 'skipped',
        reason: 'document_not_found',
        documentId,
        status,
        durationMs: duration,
        timestamp: new Date().toISOString(),
      }));
      return;
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(JSON.stringify({
      activity: activityName,
      event: 'error',
      documentId,
      status,
      error: errorMessage,
      durationMs: duration,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    }));
    throw error;
  }
}
