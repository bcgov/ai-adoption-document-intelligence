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
    },
    {
      name: "segmentOcrResult",
      label: "Segment OCR result",
      description: "OCR result for this segment.",
      required: true,
    },
  ],
  outputs: [
    {
      name: "combinedSegment",
      label: "Combined segment",
      description: "Merged segment object with ocrResult embedded.",
      required: true,
    },
  ],
  parametersSchema: segmentCombineResultParametersSchema,
};
