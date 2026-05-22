import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

export const ocrCleanupParametersSchema = z.object({});

export const ocrCleanupCatalogEntry: ActivityCatalogEntry = {
  activityType: "ocr.cleanup",
  displayName: "Cleanup",
  category: "OCR Cleanup & Correction",
  description:
    "Normalizes raw OCR text — fixes whitespace, smart quotes, hyphens, dates, unicode, dehyphenation.",
  iconHint: "sparkles",
  colorHint: "teal",
  inputs: [
    {
      name: "ocrResult",
      label: "OCR result",
      description: "OCR result to clean.",
      required: true,
    },
  ],
  outputs: [
    {
      name: "cleanedResult",
      label: "Cleaned result",
      description: "OCR result with normalized text.",
      required: true,
    },
  ],
  parametersSchema: ocrCleanupParametersSchema,
};
