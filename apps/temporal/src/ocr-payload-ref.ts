/**
 * OCR payload references — large JSON lives in blob storage; Temporal carries refs only.
 */

import {
  buildBlobFilePath,
  OperationCategory,
  validateBlobFilePath,
} from "@ai-di/blob-storage-paths";
import { getPrismaClient } from "./activities/database-client";
import { getBlobStorageClient } from "./blob-storage/blob-storage-client";
import { isOcrPayloadRef, type OcrPayloadRef } from "./ocr-payload-ref-types";
import type { OCRResponse, OCRResult } from "./types";

export type { OcrPayloadRef } from "./ocr-payload-ref-types";
export { isOcrPayloadRef } from "./ocr-payload-ref-types";

export async function resolveGroupId(documentId: string): Promise<string> {
  const prisma = getPrismaClient();
  const row = await prisma.document.findUnique({
    where: { id: documentId },
    select: { group_id: true },
  });
  if (!row?.group_id) {
    throw new Error(
      `Cannot resolve groupId for document ${documentId}: document not found`,
    );
  }
  return row.group_id;
}

export function azureResponseBlobPath(
  groupId: string,
  documentId: string,
): string {
  return buildBlobFilePath(
    groupId,
    OperationCategory.OCR,
    [documentId],
    "azure-response.json",
  );
}

export function ocrResultBlobPath(groupId: string, documentId: string): string {
  return buildBlobFilePath(
    groupId,
    OperationCategory.OCR,
    [documentId],
    "ocr-result.json",
  );
}

export function cleanedResultBlobPath(
  groupId: string,
  documentId: string,
): string {
  return buildBlobFilePath(
    groupId,
    OperationCategory.OCR,
    [documentId],
    "cleaned-result.json",
  );
}

export async function writeOcrPayloadBlob(
  groupId: string,
  documentId: string,
  fileName: string,
  json: unknown,
): Promise<{ blobPath: string; byteLength: number }> {
  if (typeof groupId !== "string" || groupId.length === 0) {
    throw new Error("writeOcrPayloadBlob requires a non-empty groupId");
  }
  if (typeof documentId !== "string" || documentId.length === 0) {
    throw new Error("writeOcrPayloadBlob requires a non-empty documentId");
  }
  if (typeof fileName !== "string" || fileName.length === 0) {
    throw new Error("writeOcrPayloadBlob requires a non-empty fileName");
  }
  const blobPath = buildBlobFilePath(
    groupId,
    OperationCategory.OCR,
    [documentId],
    fileName,
  );
  const body = JSON.stringify(json);
  const client = getBlobStorageClient();
  await client.write(validateBlobFilePath(blobPath), Buffer.from(body, "utf8"));
  return { blobPath, byteLength: Buffer.byteLength(body, "utf8") };
}

export async function readOcrPayloadBlob<T = unknown>(
  ref: OcrPayloadRef,
): Promise<T> {
  if (!ref.blobPath) {
    throw new Error(
      `OCR payload blob path is empty for document ${ref.documentId}`,
    );
  }
  const client = getBlobStorageClient();
  const data = await client.read(validateBlobFilePath(ref.blobPath));
  return JSON.parse(data.toString("utf8")) as T;
}

/** Resolve groupId from explicit value or document row. */
export async function resolveGroupIdForOcr(
  documentId: string,
  groupId?: string | null,
): Promise<string> {
  if (groupId) {
    return groupId;
  }
  return resolveGroupId(documentId);
}

/** Require a non-empty document id on activity params (after runner injection). */
export function requireDocumentId(params: { documentId?: string }): string {
  const id = params.documentId;
  if (typeof id !== "string" || id.trim().length === 0) {
    throw new Error(
      "documentId is required but was not provided to the activity. Ensure workflow initialCtx includes documentId.",
    );
  }
  return id;
}

export async function loadOcrResultFromPort(
  value: OCRResult | OcrPayloadRef,
  _groupId?: string | null,
): Promise<OCRResult> {
  if (!isOcrPayloadRef(value)) {
    return value;
  }
  return readOcrPayloadBlob<OCRResult>(value);
}

export async function loadOcrResponseFromPort(
  value: OCRResponse | OcrPayloadRef,
): Promise<OCRResponse> {
  if (!isOcrPayloadRef(value)) {
    return value;
  }
  return readOcrPayloadBlob<OCRResponse>(value);
}

export function makeOcrPayloadRef(
  documentId: string,
  blobPath: string,
  status: string,
  byteLength?: number,
): OcrPayloadRef {
  return {
    documentId,
    blobPath,
    storage: "blob",
    status,
    ...(byteLength !== undefined ? { byteLength } : {}),
  };
}

/** Write an OCR pipeline artifact and return its ref. */
export async function persistOcrArtifactRef(
  groupId: string,
  documentId: string,
  fileName: string,
  body: unknown,
  status = "succeeded",
): Promise<OcrPayloadRef> {
  const { blobPath, byteLength } = await writeOcrPayloadBlob(
    groupId,
    documentId,
    fileName,
    body,
  );
  return makeOcrPayloadRef(documentId, blobPath, status, byteLength);
}
