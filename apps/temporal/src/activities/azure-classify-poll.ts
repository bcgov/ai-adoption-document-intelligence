import { getErrorMessage, getErrorStack } from "@ai-di/shared-logging";
import DocumentIntelligence, {
  type DocumentIntelligenceClient,
  isUnexpected,
} from "@azure-rest/ai-document-intelligence";
import { createActivityLogger } from "../logger";
import type { AzureClassifySubmitOutput } from "./azure-classify-submit";

/** A single document detected by the classifier within the source file. */
export interface ClassifiedDocument {
  /** Classifier confidence score for this document. */
  confidence: number;
  /** 1-based page range (inclusive) that this document occupies in the source file. */
  pageRange: { start: number; end: number };
}

export interface AzureClassifyPollOutput {
  /** The original source blob key, unchanged. */
  originalBlobKey: string;
  /** Forwarded from the submit output for use by downstream activities (e.g. extract segment). */
  groupId: string;
  /** Forwarded from the submit output; undefined if not present in submit input. */
  documentId?: string;
  /** Map of classifier label → ordered list of detected documents with page ranges. */
  labeledDocuments: Record<string, ClassifiedDocument[]>;
}

/**
 * Temporal activity: poll Azure Document Intelligence for classifier results.
 *
 * Throws a retryable error when the operation is still in progress so that
 * Temporal automatically retries the activity.  Throws a non-retryable error
 * on failure.  On success, maps each detected document to its derived page
 * range and groups them by label.  No splitting is performed here — downstream
 * activities consume the page range information and call the split activity
 * on demand.
 */
export async function azureClassifyPoll(
  input: AzureClassifySubmitOutput,
): Promise<AzureClassifyPollOutput> {
  const activityName = "azureClassifyPoll";
  const { constructedClassifierName, blobKey, groupId, documentId } = input;
  // Strip any query parameters that may have been accidentally included in the
  // resultId (e.g. "?api-version=2024-11-30" appended by Azure's operation-location header).
  const resultId = input.resultId.split("?")[0];
  const log = createActivityLogger(activityName, {
    resultId,
    constructedClassifierName,
  });

  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  const apiKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_API_KEY;

  if (!endpoint || !apiKey) {
    throw new Error(
      "Azure Document Intelligence credentials not configured. Set AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_API_KEY.",
    );
  }

  log.info("azureClassifyPoll start", {
    event: "start",
    resultId,
    constructedClassifierName,
  });

  try {
    const client: DocumentIntelligenceClient = DocumentIntelligence(
      endpoint,
      { key: apiKey },
      { credentials: { apiKeyHeaderName: "api-key" } },
    );

    const response = await client
      .path(
        "/documentClassifiers/{classifierId}/analyzeResults/{resultId}",
        constructedClassifierName,
        resultId,
      )
      .get();

    if (isUnexpected(response)) {
      throw new Error(
        `Azure classifier poll failed. Status: ${response.status}. Body: ${JSON.stringify(response.body)}`,
      );
    }

    // The response body type is not strongly typed for classifier results, so
    // we cast through unknown to the shape we need.
    const body = response.body as unknown as {
      status: string;
      error?: { message?: string };
      analyzeResult?: {
        documents?: Array<{
          docType: string;
          confidence: number;
          boundingRegions: Array<{ pageNumber: number; polygon: number[] }>;
        }>;
      };
    };

    const status = body.status;

    if (status === "running" || status === "notStarted") {
      // Retryable — Temporal will retry the activity on non-ApplicationError errors
      throw new Error(
        `Azure classifier analysis still in progress (status: ${status})`,
      );
    }

    if (status === "failed") {
      // Non-retryable — propagate the failure details
      const detail = body.error?.message ?? "unknown error";
      throw Object.assign(
        new Error(`Azure classifier analysis failed: ${detail}`),
        { nonRetryable: true },
      );
    }

    if (status !== "succeeded") {
      throw new Error(`Azure classifier poll: unexpected status "${status}"`);
    }

    const documents = body.analyzeResult?.documents ?? [];

    log.info("azureClassifyPoll succeeded", {
      event: "succeeded",
      documentCount: documents.length,
    });

    // Derive the page range for each detected document and group by label.
    // No splitting is performed here — downstream activities receive the page
    // ranges and call the split activity on demand.
    const labeledDocuments: Record<string, ClassifiedDocument[]> = {};

    for (const doc of documents) {
      const pageNumbers = doc.boundingRegions.map((r) => r.pageNumber);
      const startPage = Math.min(...pageNumbers);
      const endPage = Math.max(...pageNumbers);

      const classifiedDoc: ClassifiedDocument = {
        confidence: doc.confidence,
        pageRange: { start: startPage, end: endPage },
      };

      if (!labeledDocuments[doc.docType]) {
        labeledDocuments[doc.docType] = [];
      }
      labeledDocuments[doc.docType].push(classifiedDoc);
    }

    return {
      originalBlobKey: blobKey,
      groupId,
      documentId,
      labeledDocuments,
    };
  } catch (error) {
    log.error("azureClassifyPoll error", {
      event: "error",
      error: getErrorMessage(error),
      stack: getErrorStack(error),
    });
    throw error;
  }
}
