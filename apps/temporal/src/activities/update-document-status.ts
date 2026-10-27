import { getErrorMessage, getErrorStack } from "@ai-di/shared-logging";
import { createActivityLogger } from "../logger";
import { getPrismaClient } from "./database-client";

/**
 * Activity: Update document status in database
 * Updates document status and optionally apim_request_id, only for a document
 * owned by `groupId`.
 */
export async function updateDocumentStatus(params: {
  documentId: string;
  status: string;
  /** Group of the running workflow; only that group's document is updated. */
  groupId?: string | null;
  apimRequestId?: string;
  requestId?: string;
}): Promise<void> {
  const activityName = "updateDocumentStatus";
  const startTime = Date.now();
  const { documentId, status, groupId, apimRequestId, requestId } = params;
  if (!groupId) {
    throw new Error(`groupId is required to update document ${documentId}`);
  }
  const log = createActivityLogger(activityName, {
    documentId,
    ...(requestId && { requestId }),
  });

  log.info("Update document status start", {
    event: "start",
    status,
    apimRequestId,
  });

  try {
    const prisma = getPrismaClient();

    const updateData: Record<string, unknown> = {
      status: status as unknown, // Cast to DocumentStatus enum
    };

    if (apimRequestId) {
      updateData.apim_request_id = apimRequestId;
    }

    const { count } = await prisma.document.updateMany({
      where: { id: documentId, group_id: groupId },
      data: updateData,
    });

    // No row matches in this group. Benchmark runs use synthetic
    // "benchmark-" document ids with no document record, so this is expected
    // there. Log and move on.
    if (count === 0) {
      const duration = Date.now() - startTime;
      log.info("Update document status skipped", {
        event: "skipped",
        reason: "document_not_found",
        status,
        durationMs: duration,
      });
      return;
    }

    log.info("Update document status complete", {
      event: "complete",
      status,
      alertType: "document_status_update",
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error("Update document status failed", {
      event: "error",
      status,
      error: getErrorMessage(error),
      durationMs: duration,
      stack: getErrorStack(error),
      alertType: "document_status_update",
    });
    throw error;
  }
}
