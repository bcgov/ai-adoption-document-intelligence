import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

export const ocrStoreResultsParametersSchema = z.object({});

export const ocrStoreResultsCatalogEntry: ActivityCatalogEntry = {
  activityType: "ocr.storeResults",
  displayName: "Store OCR Results",
  category: "Storage",
  description: "Saves processed OCR results to the database.",
  iconHint: "save",
  colorHint: "gray",
  inputs: [
    {
      name: "documentId",
      label: "Document ID",
      description: "Identifier of the document.",
      required: true,
    },
    {
      name: "ocrResult",
      label: "OCR result",
      description: "Structured OCR result to persist.",
      required: true,
    },
    {
      name: "enrichmentSummary",
      label: "Enrichment summary",
      description: "Optional enrichment summary to persist alongside the result.",
      required: false,
    },
  ],
  outputs: [],
  parametersSchema: ocrStoreResultsParametersSchema,
};
