/**
 * Activity: Combine Segment with OCR Result
 *
 * Combines segment metadata (from split, split-and-classify, or flatten) with
 * its OCR result (from child workflow) into a single object for join
 * collection.
 *
 * This is a lightweight passthrough activity used as the exit node in map bodies
 * to ensure the join node collects meaningful data instead of void/null. It
 * reads no segment-specific field — it spreads whatever segment shape it is
 * given — so its input is the generic `Segment` family, mirroring the catalog
 * port tag (KIND_TAXONOMY_REFINEMENT_DESIGN.md §2).
 */

export interface CombineSegmentResultInput {
  currentSegment: Record<string, unknown>;
  segmentOcrResult: unknown;
}

export interface CombineSegmentResultOutput {
  combinedSegment: Record<string, unknown> & { ocrResult: unknown };
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
