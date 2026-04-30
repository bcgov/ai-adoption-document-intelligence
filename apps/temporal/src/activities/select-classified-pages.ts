import { ApplicationFailure } from "@temporalio/activity";
import { createActivityLogger } from "../logger";
import type { ClassifiedDocument } from "./azure-classify-poll";

export interface SelectClassifiedPagesInput {
  /** Output of azureClassify.poll — keyed by classifier label. */
  labeledDocuments: Record<string, ClassifiedDocument[]>;
  /** The classifier label to select all page ranges for. */
  targetLabel: string;
}

export interface ClassifiedPageSegment {
  /** 1-based page range (inclusive) that this document occupies in the source file. */
  pageRange: { start: number; end: number };
  /** Classifier confidence score for this document. */
  confidence: number;
}

export interface SelectClassifiedPagesOutput {
  /** All detected segments for the target label, sorted by pageRange.start ascending. */
  segments: ClassifiedPageSegment[];
}

/**
 * Temporal activity: extract all page range segments for a specific classifier label
 * from the output of `azureClassify.poll`.
 *
 * Returns all matching segments sorted by `pageRange.start` ascending. Intended for the
 * "known-label" case where the designer knows the label name at workflow design time.
 * For dynamic or all-label fan-out, use `document.flattenClassifiedDocuments`.
 *
 * Throws a non-retryable `ApplicationFailure` when:
 * - `labeledDocuments` is empty or null/undefined
 * - `targetLabel` is not found in `labeledDocuments`
 *
 * @param input - The labeled documents map and the target label to select.
 * @returns All segments for the target label, sorted by pageRange.start.
 */
export async function selectClassifiedPages(
  input: SelectClassifiedPagesInput,
): Promise<SelectClassifiedPagesOutput> {
  const activityName = "selectClassifiedPages";
  const { labeledDocuments, targetLabel } = input;
  const log = createActivityLogger(activityName, { targetLabel });

  log.info("selectClassifiedPages start", { event: "start", targetLabel });

  if (!labeledDocuments || Object.keys(labeledDocuments).length === 0) {
    throw ApplicationFailure.nonRetryable(
      "selectClassifiedPages: labeledDocuments is empty or null — no classifier output to select from",
    );
  }

  const availableLabels = Object.keys(labeledDocuments);

  if (!availableLabels.includes(targetLabel)) {
    throw ApplicationFailure.nonRetryable(
      `selectClassifiedPages: label "${targetLabel}" not found in classifier output. Available labels: ${availableLabels.join(", ")}`,
    );
  }

  const matches = labeledDocuments[targetLabel];

  const segments: ClassifiedPageSegment[] = matches
    .map((doc) => ({
      pageRange: doc.pageRange,
      confidence: doc.confidence,
    }))
    .sort((a, b) => a.pageRange.start - b.pageRange.start);

  log.info("selectClassifiedPages complete", {
    event: "complete",
    targetLabel,
    segmentCount: segments.length,
  });

  return { segments };
}
