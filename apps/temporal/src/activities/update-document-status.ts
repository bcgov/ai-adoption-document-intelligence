import { getPrismaClient } from "./database-client";
import { createActivityLogger } from "../logger";

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
  const activityName = "updateDocumentStatus";
  const startTime = Date.now();
  const { documentId, status, apimRequestId } = params;
  const log = createActivityLogger(activityName, { documentId });

  log.info("Update document status start", {
    event: "start",
    status,
    apimRequestId,
  });

  try {
    const prisma = getPrismaClient();

    // In benchmark mode, the documentId has a "benchmark-" prefix and no
    // corresponding document record exists in the DB.  Detect this early and
    // skip the Prisma operation to avoid noisy P2025 error logs.
    if (documentId.startsWith("benchmark-")) {
      const doc = await prisma.document.findUnique({
        where: { id: documentId },
        select: { id: true },
      });
      if (!doc) {
        const duration = Date.now() - startTime;
        log.info("Update document status skipped", {
          event: "skipped",
          reason: "benchmark_mode_no_document",
          status,
          durationMs: duration,
        });
        return;
      }
    }

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

    log.info("Update document status complete", {
      event: "complete",
      status,
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    // P2025 = record not found. In benchmark mode, documents don't exist in the
    // database so the update is expected to find nothing. Log and move on.
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "P2025"
    ) {
      log.info("Update document status skipped", {
        event: "skipped",
        reason: "document_not_found",
        status,
        durationMs: duration,
      });
      return;
    }

    log.error("Update document status failed", {
      event: "error",
      status,
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: duration,
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}
