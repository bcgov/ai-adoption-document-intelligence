import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

const keywordPatternSchema = z.object({
  pattern: z.string().min(1).meta({
    title: "Pattern",
    description:
      "Regex with capture group 1 = page number (e.g., `Page (\\d+) — Monthly Report`).",
  }),
  segmentType: z.string().min(1).meta({
    title: "Segment type",
    description: "Type to assign to segments matched by this pattern.",
  }),
});

export const documentSplitAndClassifyParametersSchema = z.object({
  keywordPatterns: z
    .array(keywordPatternSchema)
    .min(1)
    .meta({
      title: "Keyword patterns",
      description:
        "Each pattern's regex must contain a single capture group for the page number.",
      "x-widget": "keyword-pattern-editor",
    }),
});

export const documentSplitAndClassifyCatalogEntry: ActivityCatalogEntry = {
  activityType: "document.splitAndClassify",
  displayName: "Split & Classify",
  category: "Document Handling",
  description:
    "Splits a PDF and classifies each segment in one step using keyword markers found in the OCR text.",
  iconHint: "scissors-with-tag",
  colorHint: "indigo",
  inputs: [
    {
      name: "blobKey",
      label: "Source file reference (blob key)",
      description: "Storage key for the multi-page PDF to split.",
      required: true,
      kind: "MultiPageDocument",
    },
    {
      name: "groupId",
      label: "Group ID",
      description: "Destination group for segment storage.",
      required: true,
      kind: "Artifact",
    },
    {
      name: "ocrResult",
      label: "OCR result",
      description: "OCR result for the full document.",
      required: true,
      kind: "OcrResult",
    },
    {
      name: "documentId",
      label: "Document ID",
      description: "Inferred from the file reference if not provided.",
      required: false,
      kind: "Artifact",
    },
  ],
  outputs: [
    {
      name: "segments",
      label: "Segments with types",
      description:
        "Standard segment fields plus segmentType, keywordMatch, and confidence.",
      required: true,
      kind: "Segment[]",
    },
  ],
  parametersSchema: documentSplitAndClassifyParametersSchema,
};
