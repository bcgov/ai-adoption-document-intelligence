import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

export const segmentCombineResultParametersSchema = z.object({});

export const segmentCombineResultCatalogEntry: ActivityCatalogEntry = {
  activityType: "segment.combineResult",
  displayName: "Combine Segment Result",
  category: "Document Handling",
  description:
    "Merges segment metadata with its OCR result into a single object — used as the body-end node in a Loop.",
  iconHint: "layers",
  colorHint: "indigo",
  inputs: [
    {
      name: "currentSegment",
      label: "Current segment",
      description: "Segment metadata produced upstream.",
      required: true,
      // family-level: the activity spreads whatever segment shape it is given
      // (DocumentSegment / TypedSegment / LabeledSegment) without reading any
      // subkind-specific field, so narrowing to a subkind would falsely reject
      // valid split→map→combine loops (KIND_TAXONOMY_REFINEMENT_DESIGN.md §2/§9).
      kind: "Segment",
    },
    {
      name: "segmentOcrResult",
      label: "Segment OCR result",
      description: "OCR result for this segment.",
      required: true,
      kind: "OcrResult",
    },
  ],
  outputs: [
    {
      name: "combinedSegment",
      label: "Combined segment",
      description: "Merged segment object with ocrResult embedded.",
      required: true,
      // stays family-level: payload embeds ocrResult (KIND_TAXONOMY_REFINEMENT_DESIGN.md §5)
      kind: "Segment",
    },
  ],
  parametersSchema: segmentCombineResultParametersSchema,
};
