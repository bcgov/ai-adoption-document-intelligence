import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

export const ocrEnrichParametersSchema = z.object({
  documentType: z.string().meta({
    title: "Document type",
    description:
      "Template model ID — selects the field schema for type-aware rules.",
    "x-widget": "documentTypePicker",
  }),
  confidenceThreshold: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .meta({
      title: "Confidence threshold",
      description:
        "Fields below this confidence are eligible for LLM correction.",
      "x-default": 0.85,
      "x-step": 0.05,
    }),
  enableLlmEnrichment: z.boolean().optional().meta({
    title: "Enable LLM enrichment",
    description:
      "Use Azure OpenAI to correct low-confidence field values.",
    "x-default": false,
  }),
});

export const ocrEnrichCatalogEntry: ActivityCatalogEntry = {
  activityType: "ocr.enrich",
  displayName: "Enrich OCR Results",
  category: "OCR Quality",
  description:
    "Applies field-schema-driven enrichment, optionally using an LLM to fix low-confidence fields.",
  iconHint: "sparkle-document",
  colorHint: "teal",
  inputs: [
    {
      name: "documentId",
      label: "Document ID",
      description: "Identifier of the document.",
      required: true,
      kind: "Artifact",
    },
    {
      name: "ocrResult",
      label: "OCR result",
      description: "OCR result to enrich.",
      required: true,
      kind: "OcrResult",
    },
  ],
  outputs: [
    {
      name: "enrichedResult",
      label: "Enriched result",
      description: "OCR result with enriched fields.",
      required: true,
      kind: "OcrResult",
    },
    {
      name: "enrichmentSummary",
      label: "Enrichment summary",
      description: "Summary of applied enrichments.",
      required: false,
      kind: "Artifact",
    },
  ],
  parametersSchema: ocrEnrichParametersSchema,
};
