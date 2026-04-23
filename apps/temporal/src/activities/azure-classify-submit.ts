import { validateBlobFilePath } from "@ai-di/blob-storage-paths";
import { getErrorMessage, getErrorStack } from "@ai-di/shared-logging";
import DocumentIntelligence, {
  type DocumentIntelligenceClient,
  isUnexpected,
} from "@azure-rest/ai-document-intelligence";
import { getBlobStorageClient } from "../blob-storage/blob-storage-client";
import { createActivityLogger } from "../logger";
import { getPrismaClient } from "./database-client";

export interface AzureClassifySubmitInput {
  /** Blob key for the document to classify. */
  blobKey: string;
  /** The group that owns this classifier. */
  groupId: string;
  /** The classifier name as stored in the ClassifierModel table. */
  classifierName: string;
  /**
   * Optional document ID. If absent it will be derived in the poll activity
   * from the blob key via `extractDocumentId`.
   */
  documentId?: string;
}

export interface AzureClassifySubmitOutput {
  /** The resultId extracted from the operation-location header (last URL path segment). */
  resultId: string;
  /** The fully-constructed classifier name used in the Azure DI request (e.g. `{groupId}__{classifierName}`). */
  constructedClassifierName: string;
  /** The original input blob key, forwarded for the poll activity. */
  blobKey: string;
  /** The group ID, forwarded for the poll activity. */
  groupId: string;
  /** The document ID if provided in the input. */
  documentId?: string;
}

/**
 * Temporal activity: submit a document to Azure Document Intelligence for
 * classifier-based page classification.
 *
 * Checks the DB for a READY classifier, then submits the document either as
 * a SAS URL (Azure storage provider) or base64 (Minio / any other provider).
 * Returns the resultId required to poll for results.
 */
export async function azureClassifySubmit(
  input: AzureClassifySubmitInput,
): Promise<AzureClassifySubmitOutput> {
  const activityName = "azureClassifySubmit";
  const { blobKey, groupId, classifierName, documentId } = input;
  const log = createActivityLogger(activityName, { groupId, classifierName });

  // Guard: ensure classifier exists and is READY
  const prisma = getPrismaClient();
  const classifier = await prisma.classifierModel.findFirst({
    where: { name: classifierName, group_id: groupId, status: "READY" },
  });

  if (!classifier) {
    throw new Error(
      `Classifier "${classifierName}" for group "${groupId}" not found or not READY`,
    );
  }

  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  const apiKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_API_KEY;

  if (!endpoint || !apiKey) {
    throw new Error(
      "Azure Document Intelligence credentials not configured. Set AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_API_KEY.",
    );
  }

  const constructedClassifierName = `${groupId}__${classifierName}`;

  log.info("azureClassifySubmit start", {
    event: "start",
    blobKey,
    constructedClassifierName,
  });

  try {
    const client: DocumentIntelligenceClient = DocumentIntelligence(
      endpoint,
      { key: apiKey },
      { credentials: { apiKeyHeaderName: "api-key" } },
    );

    const blobStorageClient = getBlobStorageClient();
    const provider = (
      process.env.BLOB_STORAGE_PROVIDER ?? "minio"
    ).toLowerCase();

    let requestBody: { urlSource: string } | { base64Source: string };

    if (provider === "azure") {
      const sasUrl = await blobStorageClient.generateSasUrl(
        validateBlobFilePath(blobKey),
        15,
      );
      requestBody = { urlSource: sasUrl };
    } else {
      const fileData = await blobStorageClient.read(
        validateBlobFilePath(blobKey),
      );
      requestBody = { base64Source: fileData.toString("base64") };
    }

    const response = await client
      // @ts-expect-error: Azure SDK type is too strict for .path() on classifier endpoints
      .path(`/documentClassifiers/${constructedClassifierName}:analyze`)
      .post({
        body: requestBody,
        contentType: "application/json",
        queryParameters: {
          "api-version": "2024-11-30",
          _overload: "classifyDocument",
          splitMode: "auto",
        },
      });

    if (isUnexpected(response)) {
      throw new Error(
        `Azure classifier submit failed. Status: ${response.status}. Body: ${JSON.stringify(response.body)}`,
      );
    }

    if (Number(response.status) !== 202) {
      throw new Error(
        `Azure classifier submit: unexpected status ${response.status}. Body: ${JSON.stringify(response.body)}`,
      );
    }

    const operationLocation =
      response.headers["operation-location"] ||
      response.headers["Operation-Location"];

    if (!operationLocation || typeof operationLocation !== "string") {
      throw new Error(
        "Azure classifier submit: missing operation-location header in 202 response",
      );
    }

    // Extract resultId as the last path segment of the operation-location URL.
    // Strip any query parameters (e.g. ?api-version=...) that Azure appends.
    const rawSegment = operationLocation.split("/").pop();
    const resultId = rawSegment?.split("?")[0];
    if (!resultId) {
      throw new Error(
        `Azure classifier submit: could not extract resultId from operation-location: ${operationLocation}`,
      );
    }

    log.info("azureClassifySubmit complete", {
      event: "complete",
      resultId,
      constructedClassifierName,
    });

    return {
      resultId,
      constructedClassifierName,
      blobKey,
      groupId,
      ...(documentId !== undefined && { documentId }),
    };
  } catch (error) {
    log.error("azureClassifySubmit error", {
      event: "error",
      constructedClassifierName,
      error: getErrorMessage(error),
      stack: getErrorStack(error),
    });
    throw error;
  }
}
