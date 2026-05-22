/**
 * Catalog entry for `ocr.checkConfidence`.
 *
 * Calculates average confidence across OCR fields and flags whether the
 * result needs human review. Typically paired with a Switch node downstream
 * that branches on `requiresReview`.
 *
 * See docs-md/workflow-builder/WORKFLOW_NODE_CATALOG.md → "Check Confidence".
 */

import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

export const ocrCheckConfidenceParametersSchema = z.object({
  threshold: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .meta({
      title: "Confidence threshold",
      description:
        "Below this value the result is flagged for review. 0 = always pass, 1 = always flag.",
      "x-default": 0.95,
      "x-step": 0.01,
    }),
});

export const ocrCheckConfidenceCatalogEntry: ActivityCatalogEntry = {
  activityType: "ocr.checkConfidence",
  displayName: "Check Confidence",
  category: "OCR Quality",
  description:
    "Calculates average confidence across OCR fields and flags whether the result needs human review.",
  iconHint: "gauge",
  colorHint: "teal",
  inputs: [
    {
      name: "documentId",
      label: "Document ID",
      required: true,
    },
    {
      name: "ocrResult",
      label: "OCR result",
      description: "Structured OCR result to evaluate.",
      required: true,
    },
  ],
  outputs: [
    {
      name: "averageConfidence",
      label: "Average confidence",
      description: "Number between 0 and 1.",
      required: true,
    },
    {
      name: "requiresReview",
      label: "Requires review",
      description: "True if average confidence is below the threshold.",
      required: true,
    },
  ],
  parametersSchema: ocrCheckConfidenceParametersSchema,
};
