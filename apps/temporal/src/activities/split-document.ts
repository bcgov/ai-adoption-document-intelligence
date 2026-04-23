import {
  buildBlobFilePath,
  OperationCategory,
  validateBlobFilePath,
} from "@ai-di/blob-storage-paths";
import { PDFDocument } from "pdf-lib";
import { getBlobStorageClient } from "../blob-storage/blob-storage-client";

export interface SplitDocumentInput {
  blobKey: string;
  groupId: string;
  strategy: "per-page" | "fixed-range" | "custom-ranges";
  fixedRangeSize?: number;
  customRanges?: Array<{ start: number; end: number }>;
  documentId?: string;
}

export interface DocumentSegment {
  segmentIndex: number;
  pageRange: { start: number; end: number };
  blobKey: string;
  pageCount: number;
}

export interface SplitDocumentOutput {
  segments: DocumentSegment[];
}

export async function splitDocument(
  input: SplitDocumentInput,
): Promise<SplitDocumentOutput> {
  const blobStorage = getBlobStorageClient();
  const sourceData = await blobStorage.read(
    validateBlobFilePath(input.blobKey),
  );

  const srcDoc = await PDFDocument.load(new Uint8Array(sourceData));
  const totalPages = srcDoc.getPageCount();
  const ranges = await buildRanges(input, totalPages);

  const documentId = input.documentId ?? extractDocumentId(input.blobKey);
  if (!documentId) {
    throw new Error(
      `documentId is required to build segment keys (blobKey=${input.blobKey})`,
    );
  }

  const segments: DocumentSegment[] = [];
  for (let i = 0; i < ranges.length; i += 1) {
    const range = ranges[i];
    const segmentIndex = i + 1;
    const segmentKey = buildBlobFilePath(
      input.groupId,
      OperationCategory.OCR,
      [documentId, "segments"],
      `segment-${padIndex(segmentIndex)}-pages-${range.start}-${range.end}.pdf`,
    );

    const segmentData = await extractRange(sourceData, range.start, range.end);
    await blobStorage.write(segmentKey, segmentData);

    segments.push({
      segmentIndex,
      pageRange: { start: range.start, end: range.end },
      blobKey: segmentKey,
      pageCount: range.end - range.start + 1,
    });
  }

  return { segments };
}

/**
 * Extracts a page range from a PDF buffer and returns the result as a new Buffer.
 * Uses pdf-lib — operates entirely in memory with no temporary files or system binaries.
 * Pages are 1-based and inclusive.
 */
async function extractRange(
  sourceData: Buffer,
  start: number,
  end: number,
): Promise<Buffer> {
  const srcDoc = await PDFDocument.load(new Uint8Array(sourceData));
  const newDoc = await PDFDocument.create();
  // pdf-lib uses 0-based page indices; start/end are 1-based
  const indices = Array.from(
    { length: end - start + 1 },
    (_, i) => start - 1 + i,
  );
  const pages = await newDoc.copyPages(srcDoc, indices);
  pages.forEach((page) => {
    newDoc.addPage(page);
  });
  return Buffer.from(await newDoc.save());
}

async function buildRanges(
  input: SplitDocumentInput,
  totalPages: number,
): Promise<Array<{ start: number; end: number }>> {
  if (input.strategy === "per-page") {
    return Array.from({ length: totalPages }, (_, index) => ({
      start: index + 1,
      end: index + 1,
    }));
  }

  if (input.strategy === "fixed-range") {
    const size = input.fixedRangeSize;
    if (!size || size <= 0) {
      throw new Error("fixedRangeSize is required for fixed-range strategy");
    }
    const ranges: Array<{ start: number; end: number }> = [];
    for (let start = 1; start <= totalPages; start += size) {
      const end = Math.min(start + size - 1, totalPages);
      ranges.push({ start, end });
    }
    return ranges;
  }

  if (input.strategy === "custom-ranges") {
    if (!input.customRanges || input.customRanges.length === 0) {
      throw new Error("customRanges is required for custom-ranges strategy");
    }
    validateCustomRanges(input.customRanges, totalPages);
    return input.customRanges;
  }

  throw new Error(`Unknown strategy: ${input.strategy}`);
}

function validateCustomRanges(
  ranges: Array<{ start: number; end: number }>,
  totalPages: number,
): void {
  for (let i = 0; i < ranges.length; i += 1) {
    const range = ranges[i];

    // Validate range is valid (start <= end)
    if (range.start > range.end) {
      throw new Error(
        `Invalid range [${range.start}-${range.end}]: start must be <= end`,
      );
    }

    // Validate range is within document bounds
    if (range.start < 1 || range.end > totalPages) {
      throw new Error(
        `Range [${range.start}-${range.end}] is out of bounds (document has ${totalPages} pages)`,
      );
    }

    // Check for overlaps with previous ranges
    for (let j = 0; j < i; j += 1) {
      const other = ranges[j];
      const overlaps =
        (range.start >= other.start && range.start <= other.end) ||
        (range.end >= other.start && range.end <= other.end) ||
        (range.start <= other.start && range.end >= other.end);

      if (overlaps) {
        throw new Error(
          `Range [${range.start}-${range.end}] overlaps with range [${other.start}-${other.end}]`,
        );
      }
    }
  }
}

export function extractDocumentId(blobKey: string): string | undefined {
  const match = blobKey.match(/^documents\/([^/]+)\//);
  return match?.[1];
}

function padIndex(index: number): string {
  return String(index).padStart(3, "0");
}
