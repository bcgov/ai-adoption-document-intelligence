/**
 * Activity: Combine Segment with OCR Result
 *
 * Combines segment metadata (from split-and-classify) with its OCR result
 * (from child workflow) into a single object for join collection.
 *
 * This is a lightweight passthrough activity used as the exit node in map bodies
 * to ensure the join node collects meaningful data instead of void/null.
 */

export interface CombineSegmentResultInput {
  currentSegment: {
    segmentIndex: number;
    pageRange: { start: number; end: number };
    blobKey: string;
    pageCount: number;
    segmentType: string;
    keywordMatch?: string;
    confidence: number;
  };
  segmentOcrResult: unknown;
}

export interface CombineSegmentResultOutput {
  combinedSegment: {
    segmentIndex: number;
    pageRange: { start: number; end: number };
    blobKey: string;
    pageCount: number;
    segmentType: string;
    keywordMatch?: string;
    confidence: number;
    ocrResult: unknown;
  };
}

export async function combineSegmentResult(
  input: CombineSegmentResultInput,
): Promise<CombineSegmentResultOutput> {
  const { currentSegment, segmentOcrResult } = input;

  return {
    combinedSegment: {
      ...currentSegment,
      ocrResult: segmentOcrResult,
    },
  };
}
