import { createActivityLogger } from "../logger";
import type { ClassifiedDocument } from "./azure-classify-poll";

export interface FlattenClassifiedDocumentsInput {
  /** Output of azureClassify.poll — keyed by classifier label. */
  labeledDocuments: Record<string, ClassifiedDocument[]>;
  /**
   * Optional allow-list of labels to include.
   * When omitted, all labels are included. Labels in filterLabels that are
   * absent from labeledDocuments are silently skipped.
   */
  filterLabels?: string[];
}

export interface ClassifiedSegment {
  /** The classifier label assigned to this segment. */
  label: string;
  /** 1-based page range (inclusive) that this document occupies in the source file. */
  pageRange: { start: number; end: number };
  /** Classifier confidence score for this segment. */
  confidence: number;
}

export interface FlattenClassifiedDocumentsOutput {
  /** Flat, page-ordered array of detected document segments. */
  segments: ClassifiedSegment[];
}

/**
 * Temporal activity: flatten the `labeledDocuments` map from `azureClassify.poll`
 * output into a single sorted array of segments, optionally filtered to a subset
 * of labels.
 *
 * Intended for the "all-labels fan-out" case where a `map` node needs to iterate
 * over every detected segment regardless of label. For single-label selection,
 * use `document.selectClassifiedPages`.
 *
 * Returns an empty array when `labeledDocuments` is empty or null — no error is thrown.
 * Labels in `filterLabels` that are absent from `labeledDocuments` are silently skipped.
 *
 * @param input - The labeled documents map and an optional label filter.
 * @returns All matching segments sorted by pageRange.start ascending.
 */
export async function flattenClassifiedDocuments(
  input: FlattenClassifiedDocumentsInput,
): Promise<FlattenClassifiedDocumentsOutput> {
  const activityName = "flattenClassifiedDocuments";
  const { labeledDocuments, filterLabels } = input;
  const log = createActivityLogger(activityName, {
    filterLabels: filterLabels ?? "all",
  });

  log.info("flattenClassifiedDocuments start", {
    event: "start",
    filterLabels: filterLabels ?? "all",
  });

  if (!labeledDocuments || Object.keys(labeledDocuments).length === 0) {
    log.info("flattenClassifiedDocuments complete — empty input", {
      event: "complete",
      segmentCount: 0,
    });
    return { segments: [] };
  }

  const segments: ClassifiedSegment[] = [];

  for (const [label, documents] of Object.entries(labeledDocuments)) {
    if (filterLabels !== undefined && !filterLabels.includes(label)) {
      continue;
    }
    for (const doc of documents) {
      segments.push({
        label,
        pageRange: doc.pageRange,
        confidence: doc.confidence,
      });
    }
  }

  segments.sort((a, b) => a.pageRange.start - b.pageRange.start);

  log.info("flattenClassifiedDocuments complete", {
    event: "complete",
    segmentCount: segments.length,
  });

  return { segments };
}
