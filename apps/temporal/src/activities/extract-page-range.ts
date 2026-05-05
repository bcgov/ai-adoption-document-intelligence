import { getErrorMessage, getErrorStack } from "@ai-di/shared-logging";
import { createActivityLogger } from "../logger";
import { extractDocumentId, splitDocument } from "./split-document";

export interface ExtractPageRangeInput {
  /** Blob key of the source document. */
  blobKey: string;
  /** Group ID — used by splitDocument for building the segment blob path. */
  groupId: string;
  /** Page range to extract (1-based, inclusive). */
  pageRange: { start: number; end: number };
  /** Optional document ID. Derived from blobKey via extractDocumentId if absent. */
  documentId?: string;
}

export interface ExtractPageRangeOutput {
  /** Blob key of the newly written segment. */
  segmentBlobKey: string;
  /** The extracted page range, echoed from the input. */
  pageRange: { start: number; end: number };
}

/**
 * Temporal activity: extract a specific page range from a source document and
 * write it as a new blob segment.
 *
 * Calls the existing `splitDocument` helper with `strategy: "custom-ranges"` and
 * the provided page range.  If `documentId` is not supplied it is derived from
 * the `blobKey` using `extractDocumentId`, matching `splitDocument`'s own fallback.
 *
 * @param input - Source document details and the page range to extract.
 * @returns The blob key of the extracted segment and the echoed page range.
 */
export async function extractPageRange(
  input: ExtractPageRangeInput,
): Promise<ExtractPageRangeOutput> {
  const activityName = "extractPageRange";
  const { blobKey, groupId, pageRange, documentId } = input;
  const log = createActivityLogger(activityName, { blobKey, pageRange });

  log.info("extractPageRange start", { event: "start", blobKey, pageRange });

  try {
    const resolvedDocumentId = documentId ?? extractDocumentId(blobKey);

    const splitOutput = await splitDocument({
      blobKey,
      groupId,
      strategy: "custom-ranges",
      customRanges: [{ start: pageRange.start, end: pageRange.end }],
      documentId: resolvedDocumentId,
    });

    const segmentBlobKey = splitOutput.segments[0].blobKey;

    log.info("extractPageRange complete", {
      event: "complete",
      segmentBlobKey,
    });

    return { segmentBlobKey, pageRange };
  } catch (error) {
    log.error("extractPageRange error", {
      event: "error",
      error: getErrorMessage(error),
      stack: getErrorStack(error),
    });
    throw error;
  }
}
