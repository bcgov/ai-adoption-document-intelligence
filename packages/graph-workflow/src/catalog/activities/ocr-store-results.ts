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
  // DB upsert — a cache hit would skip persistence, same class as
  // document.updateStatus. See US-134 + TRY_IN_PLACE_DESIGN.md §2.6.
  nonCacheable: true,
  inputs: [
    {
      name: "documentId",
      label: "Document ID",
      description: "Identifier of the document.",
      required: true,
      kind: "DocumentId",
    },
    {
      name: "ocrResult",
      label: "OCR result",
      description: "Structured OCR result to persist.",
      required: true,
      kind: "OcrResult",
    },
    {
      name: "enrichmentSummary",
      label: "Enrichment summary",
      description:
        "Optional enrichment summary to persist alongside the result.",
      required: false,
      kind: "Artifact",
    },
  ],
  outputs: [],
  parametersSchema: ocrStoreResultsParametersSchema,
};
