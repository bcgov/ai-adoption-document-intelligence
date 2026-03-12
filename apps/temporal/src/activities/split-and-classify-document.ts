import type { OCRResult } from "../types";
import { type DocumentSegment, splitDocument } from "./split-document";

export interface KeywordPattern {
  pattern: string; // Regex pattern to match keyword text (capture group optional)
  segmentType: string; // Document type to assign when pattern matches
}

export interface SplitAndClassifyInput {
  blobKey: string;
  ocrResult: OCRResult;
  documentId?: string;
  keywordPatterns?: KeywordPattern[];
}

export interface SegmentWithType extends DocumentSegment {
  segmentType: string; // Classified document type
  keywordMatch?: string; // The keyword text that triggered classification
  confidence: number; // Classification confidence (0.9 for matched, 0.2 for unknown)
}

export interface SplitAndClassifyOutput {
  segments: SegmentWithType[];
}

interface KeywordMarker {
  pageNumber: number;
  segmentType: string;
  matchedText: string;
}

/**
 * Split and classify a PDF document based on keyword markers found in OCR text.
 *
 * This activity:
 * 1. Searches OCR text for keyword markers (e.g., "Page 1 — Monthly Report")
 * 2. Extracts page numbers and document types from markers
 * 3. Determines page ranges for each document segment
 * 4. Uses PDF splitting to create segment files
 * 5. Returns segments with embedded type information
 *
 * @param input - Configuration including blobKey, OCR result, and keyword patterns
 * @returns Array of document segments with classification information
 */
export async function splitAndClassifyDocument(
  input: SplitAndClassifyInput,
): Promise<SplitAndClassifyOutput> {
  const { blobKey, ocrResult, documentId, keywordPatterns = [] } = input;

  // Validate input
  if (!ocrResult.extractedText) {
    throw new Error(
      "OCR result extractedText is empty - cannot perform keyword-based splitting",
    );
  }

  if (keywordPatterns.length === 0) {
    throw new Error(
      "No keyword patterns provided - cannot perform keyword-based splitting",
    );
  }

  // Step 1: Extract keyword markers from OCR text
  const markers = extractKeywordMarkers(ocrResult, keywordPatterns);

  // Step 2: Determine page ranges for each segment
  const totalPages = ocrResult.pages?.length ?? 0;
  if (totalPages === 0) {
    throw new Error("OCR result contains no pages");
  }

  const pageRanges = buildPageRanges(markers, totalPages);

  // Step 3: Split PDF using existing logic
  const segments = await splitDocument({
    blobKey,
    strategy: "custom-ranges",
    customRanges: pageRanges.map((r) => ({ start: r.start, end: r.end })),
    documentId,
  });

  // Step 4: Merge split results with classification
  const segmentsWithTypes: SegmentWithType[] = segments.segments.map(
    (segment, index) => {
      const range = pageRanges[index];
      return {
        ...segment,
        segmentType: range?.type || "unknown",
        keywordMatch: range?.matchedText,
        confidence: range?.type && range.type !== "unknown" ? 0.9 : 0.2,
      };
    },
  );

  return { segments: segmentsWithTypes };
}

/**
 * Extract keyword markers from OCR output using regex patterns.
 *
 * Searches for patterns like "Page 1 — Monthly Report" and extracts:
 * - Page number (from OCR page position when available)
 * - Segment type (from pattern configuration)
 * - Matched text (for debugging/logging)
 *
 * @param ocrResult - OCR result with per-page content
 * @param patterns - Array of keyword patterns to match
 * @returns Array of markers sorted by page number
 */
function extractKeywordMarkers(
  ocrResult: OCRResult,
  patterns: KeywordPattern[],
): KeywordMarker[] {
  const markers: KeywordMarker[] = [];
  const compiledPatterns = patterns.map((pattern) => {
    try {
      return { ...pattern, regex: new RegExp(pattern.pattern, "i") };
    } catch (error) {
      throw new Error(
        `Invalid regex pattern "${pattern.pattern}": ${(error as Error).message}`,
      );
    }
  });

  const pageMarkers = extractMarkersFromPages(ocrResult, compiledPatterns);
  if (pageMarkers.length > 0) {
    pageMarkers.sort((a, b) => a.pageNumber - b.pageNumber);
    return pageMarkers;
  }

  const text = ocrResult.extractedText ?? "";
  const lines = text.split("\n");

  for (const line of lines) {
    for (const pattern of compiledPatterns) {
      const match = pattern.regex.exec(line);

      if (match && match[1]) {
        const pageNum = parseInt(match[1], 10);
        if (!isNaN(pageNum) && pageNum > 0) {
          // Check if we already have a marker for this page
          const existing = markers.find((m) => m.pageNumber === pageNum);
          if (!existing) {
            markers.push({
              pageNumber: pageNum,
              segmentType: pattern.segmentType,
              matchedText: line.trim(),
            });
          }
        }
      }
    }
  }

  // Sort by page number
  markers.sort((a, b) => a.pageNumber - b.pageNumber);

  return markers;
}

function extractMarkersFromPages(
  ocrResult: OCRResult,
  patterns: Array<KeywordPattern & { regex: RegExp }>,
): KeywordMarker[] {
  const markers: KeywordMarker[] = [];
  const pages = ocrResult.pages ?? [];

  for (const page of pages) {
    const lines = page.lines ?? [];
    if (lines.length === 0) {
      continue;
    }

    for (const line of lines) {
      for (const pattern of patterns) {
        const match = pattern.regex.exec(line.content);
        if (match) {
          const existing = markers.find(
            (marker) => marker.pageNumber === page.pageNumber,
          );
          if (!existing) {
            markers.push({
              pageNumber: page.pageNumber,
              segmentType: pattern.segmentType,
              matchedText: line.content.trim(),
            });
          }
        }
      }
    }
  }

  return markers;
}

/**
 * Build page ranges for document segments based on keyword markers.
 *
 * Strategy:
 * - Each marker indicates the start of a new segment
 * - Segment extends until the next marker (or end of document)
 * - If no markers found, treat entire document as one "unknown" segment
 *
 * Example:
 *   Markers at pages 1, 4, 5 with 5 total pages
 *   → Ranges: [1-3, 4-4, 5-5]
 *
 * @param markers - Sorted array of keyword markers
 * @param totalPages - Total number of pages in the document
 * @returns Array of page ranges with types
 */
function buildPageRanges(
  markers: KeywordMarker[],
  totalPages: number,
): Array<{ start: number; end: number; type: string; matchedText?: string }> {
  if (markers.length === 0) {
    // Fallback: treat entire document as one segment
    return [{ start: 1, end: totalPages, type: "unknown" }];
  }

  const ranges: Array<{
    start: number;
    end: number;
    type: string;
    matchedText?: string;
  }> = [];

  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].pageNumber;
    const end =
      i + 1 < markers.length ? markers[i + 1].pageNumber - 1 : totalPages;

    // Validate range
    if (start > totalPages) {
      throw new Error(
        `Keyword marker references page ${start} but document only has ${totalPages} pages`,
      );
    }

    if (start > end) {
      // Skip invalid ranges (markers on consecutive pages)
      continue;
    }

    ranges.push({
      start,
      end: Math.min(end, totalPages),
      type: markers[i].segmentType,
      matchedText: markers[i].matchedText,
    });
  }

  // Validate we have at least one range
  if (ranges.length === 0) {
    throw new Error("No valid page ranges could be built from keyword markers");
  }

  return ranges;
}
