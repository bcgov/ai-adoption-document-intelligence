import {
  buildBlobFilePath,
  OperationCategory,
  validateBlobFilePath,
} from "@ai-di/blob-storage-paths";
import { PDFDocument } from "pdf-lib";
import { getBlobStorageClient } from "../blob-storage/blob-storage-client";
import { extractDocumentId } from "./split-document";

/**
 * Input parameters for the extractPagesBase64 activity (`document.extractToBase64`).
 */
export interface ExtractPagesBase64Input {
  /** Blob storage key of the source PDF. */
  blobKey: string;
  /** First page to extract (1-based, inclusive). */
  startPage: number;
  /** Last page to extract (1-based, inclusive). */
  endPage: number;
  /** Group ID for the extracted-page blob path (CUID). */
  groupId: string;
  /** Document ID; derived from blobKey when omitted. */
  documentId?: string;
}

/**
 * Result returned by the extractPagesBase64 activity.
 * Large PDF bytes are written to blob storage; history carries the path only.
 */
export interface ExtractPagesBase64Output {
  /** Blob path of the extracted page-range PDF. */
  pageBlobPath: string;
  /** First extracted page number (1-based), same as `startPage`. */
  pageIndex: number;
  /** Size of the written PDF in bytes. */
  byteLength: number;
  /** Number of pages in the extracted PDF (`endPage - startPage + 1`). */
  pageCount: number;
}

/**
 * Activity: Extract a page range from a PDF blob and persist it to blob storage.
 *
 * Downloads the source PDF, copies the requested page range into a new PDF,
 * writes it under `{groupId}/ocr/{documentId}/page-range-{start}-{end}.pdf`,
 * and returns `pageBlobPath` (no inline base64 in Temporal history).
 */
export async function extractPagesBase64(
  input: ExtractPagesBase64Input,
): Promise<ExtractPagesBase64Output> {
  const documentId =
    input.documentId ??
    extractDocumentId(input.blobKey) ??
    parseDocumentIdFromOcrBlobKey(input.blobKey);
  if (!documentId) {
    throw new Error(
      `documentId is required to write extracted pages (blobKey=${input.blobKey})`,
    );
  }

  const blobStorage = getBlobStorageClient();
  const sourceData = await blobStorage.read(
    validateBlobFilePath(input.blobKey),
  );

  const outputBytes = await extractPageRangeBytes(
    sourceData,
    input.startPage,
    input.endPage,
  );

  const pageCount = input.endPage - input.startPage + 1;
  const fileName = `page-range-${input.startPage}-${input.endPage}.pdf`;
  const pageBlobPath = buildBlobFilePath(
    input.groupId,
    OperationCategory.OCR,
    [documentId, "page-extracts"],
    fileName,
  );

  await blobStorage.write(validateBlobFilePath(pageBlobPath), outputBytes);

  return {
    pageBlobPath,
    pageIndex: input.startPage,
    byteLength: outputBytes.length,
    pageCount,
  };
}

async function extractPageRangeBytes(
  sourceData: Buffer,
  startPage: number,
  endPage: number,
): Promise<Buffer> {
  const sourceDoc = await PDFDocument.load(new Uint8Array(sourceData));
  const newDoc = await PDFDocument.create();

  const pageIndices = Array.from(
    { length: endPage - startPage + 1 },
    (_, i) => startPage - 1 + i,
  );

  const copiedPages = await newDoc.copyPages(sourceDoc, pageIndices);
  for (const page of copiedPages) {
    newDoc.addPage(page);
  }

  return Buffer.from(await newDoc.save());
}

/** `{groupId}/ocr/{documentId}/...` layout used by OCR blobs. */
export function parseDocumentIdFromOcrBlobKey(
  blobKey: string,
): string | undefined {
  const parts = blobKey.split("/");
  if (parts.length >= 3 && parts[1] === "ocr") {
    return parts[2];
  }
  return undefined;
}
