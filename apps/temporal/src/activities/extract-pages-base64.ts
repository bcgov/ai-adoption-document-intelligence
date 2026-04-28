import { validateBlobFilePath } from "@ai-di/blob-storage-paths";
import { PDFDocument } from "pdf-lib";
import { getBlobStorageClient } from "../blob-storage/blob-storage-client";

/**
 * Input parameters for the extractPagesBase64 activity.
 */
export interface ExtractPagesBase64Input {
  /** Blob storage key of the source PDF. */
  blobKey: string;
  /** First page to extract (1-based, inclusive). */
  startPage: number;
  /** Last page to extract (1-based, inclusive). */
  endPage: number;
}

/**
 * Result returned by the extractPagesBase64 activity.
 */
export interface ExtractPagesBase64Output {
  /** Base64-encoded PDF containing only the extracted pages. */
  base64: string;
  /** Number of pages in the extracted PDF (`endPage - startPage + 1`). */
  pageCount: number;
}

/**
 * Activity: Extract a page range from a PDF blob and return the result as base64.
 *
 * Downloads the source PDF from blob storage, uses `pdf-lib` to copy the
 * requested page range into a new in-memory PDF document, and returns the
 * result as a base64-encoded string. The extracted PDF is **not** written
 * back to blob storage; it is returned directly in the activity output so
 * it can be bound into a downstream `data.transform` field mapping.
 *
 * @param input - Activity input parameters.
 * @returns The base64-encoded extracted PDF and its page count.
 */
export async function extractPagesBase64(
  input: ExtractPagesBase64Input,
): Promise<ExtractPagesBase64Output> {
  const blobStorage = getBlobStorageClient();
  const sourceData = await blobStorage.read(
    validateBlobFilePath(input.blobKey),
  );

  const sourceDoc = await PDFDocument.load(new Uint8Array(sourceData));
  const newDoc = await PDFDocument.create();

  const pageIndices = Array.from(
    { length: input.endPage - input.startPage + 1 },
    (_, i) => input.startPage - 1 + i,
  );

  // This looks duplicative, but it's not.
  // .copyPages copies the page objects (deep copy) so it doesn't reference the original
  // .addPage inserts the transferred page into the new doc's page order.
  const copiedPages = await newDoc.copyPages(sourceDoc, pageIndices);
  for (const page of copiedPages) {
    newDoc.addPage(page);
  }

  const outputBytes = await newDoc.save();

  return {
    base64: Buffer.from(outputBytes).toString("base64"),
    pageCount: pageIndices.length,
  };
}
