import { getErrorMessage, getErrorStack } from "@ai-di/shared-logging";
import { createActivityLogger } from "../logger";
import { getPrismaClient } from "./database-client";

/**
 * Activity: Get document status from database
 * Returns the current status of a document
 */
export async function getDocumentStatus(params: {
  documentId: string;
  requestId?: string;
}): Promise<{ status: string }> {
  const activityName = "getDocumentStatus";
  const startTime = Date.now();
  const { documentId, requestId } = params;
  const log = createActivityLogger(activityName, {
    documentId,
    ...(requestId && { requestId }),
  });

  log.info("Get document status start", {
    event: "start",
  });

  try {
    const prisma = getPrismaClient();

    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { status: true },
    });

    if (!document) {
      throw new Error(`Document ${documentId} not found`);
    }

    const duration = Date.now() - startTime;
    log.info("Get document status complete", {
      event: "complete",
      status: document.status,
      durationMs: duration,
    });

    return { status: document.status };
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error("Get document status failed", {
      event: "error",
      error: getErrorMessage(error),
      stack: getErrorStack(error),
      durationMs: duration,
    });
    throw error;
  }
}
