import { getErrorMessage, getErrorStack } from "@ai-di/shared-logging";
import { groupScopeViolation } from "../group-scope-violation";
import { createActivityLogger } from "../logger";
import { getPrismaClient } from "./database-client";

/**
 * Activity: Store document rejection data
 * Stores rejection reason, annotations, and reviewer information
 */
export async function storeDocumentRejection(params: {
  documentId: string;
  /** Group of the running workflow; only that group's document is written. */
  groupId?: string | null;
  reason: string;
  reviewer?: string;
  annotations?: string;
  requestId?: string;
}): Promise<void> {
  const activityName = "storeDocumentRejection";
  const { documentId, groupId, reason, reviewer, annotations, requestId } =
    params;
  if (!groupId) {
    throw new Error(
      `groupId is required to store the rejection of document ${documentId}`,
    );
  }
  const startTime = Date.now();
  const log = createActivityLogger(activityName, {
    documentId,
    ...(requestId && { requestId }),
  });

  log.info("Store document rejection start", {
    event: "start",
    reason,
    reviewer,
    hasAnnotations: !!annotations,
  });

  try {
    const prisma = getPrismaClient();
    const document = await prisma.document.findFirst({
      where: { id: documentId, group_id: groupId },
      select: { id: true },
    });
    if (!document) {
      throw groupScopeViolation(`Document not found: ${documentId}`);
    }
    // documentRejection: add DocumentRejection model to shared prisma schema and run migration when ready
    // biome-ignore lint/suspicious/noExplicitAny: DocumentRejection model not yet in Prisma schema
    await (prisma as Record<string, any>).documentRejection.upsert({
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

    log.info("Store document rejection complete", {
      event: "complete",
      reason,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = getErrorMessage(error);
    log.error("Store document rejection error", {
      event: "error",
      reason,
      error: errorMessage,
      durationMs: duration,
      stack: getErrorStack(error),
    });
    throw error;
  }
}
