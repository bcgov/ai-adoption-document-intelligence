/**
 * OCR payload references — large JSON lives in blob storage; Temporal carries refs only.
 */

import {
  buildBlobFilePath,
  OperationCategory,
} from "@ai-di/blob-storage-paths";
import { getGroupBlobStorage } from "./blob-storage/group-blob-storage";
import { isOcrPayloadRef, type OcrPayloadRef } from "./ocr-payload-ref-types";
import type { OCRResult } from "./types";

export type { OcrPayloadRef } from "./ocr-payload-ref-types";
export { isOcrPayloadRef } from "./ocr-payload-ref-types";

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
  await getGroupBlobStorage(groupId).write(blobPath, Buffer.from(body, "utf8"));
  return { blobPath, byteLength: Buffer.byteLength(body, "utf8") };
}

/**
 * Reads an OCR payload blob for a workflow running in `groupId`. The ref's
 * blob path must belong to that group.
 */
export async function readOcrPayloadBlobInGroup<T = unknown>(
  ref: OcrPayloadRef,
  groupId: string | null | undefined,
): Promise<T> {
  if (!groupId) {
    throw new Error(
      `groupId is required to read the OCR payload for document ${ref.documentId}`,
    );
  }
  if (!ref.blobPath) {
    throw new Error(
      `OCR payload blob path is empty for document ${ref.documentId}`,
    );
  }
  const data = await getGroupBlobStorage(groupId).read(ref.blobPath);
  return JSON.parse(data.toString("utf8")) as T;
}

/**
 * Returns the run's groupId, which the graph engine injects into every
 * activity. Throws when it is missing rather than deriving a group from
 * the document id.
 */
export async function resolveGroupIdForOcr(
  documentId: string,
  groupId?: string | null,
): Promise<string> {
  if (!groupId) {
    throw new Error(
      `groupId is required for OCR payloads of document ${documentId}`,
    );
  }
  return groupId;
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
  groupId: string | null | undefined,
): Promise<OCRResult> {
  if (!isOcrPayloadRef(value)) {
    return value;
  }
  return readOcrPayloadBlobInGroup<OCRResult>(value, groupId);
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
