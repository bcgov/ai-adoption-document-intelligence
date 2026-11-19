import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

const MISTRAL_VARIANTS = ["native", "azure"] as const;

// Mirrors `MistralOcrProcessParams` in
// apps/temporal/src/activities/mistral-ocr-process.ts, less the values that
// arrive as inputs (`fileData`, `templateModelId`) and the ones the engine
// supplies (`documentId`, `groupId`, `requestId`).
export const mistralOcrProcessParametersSchema = z.object({
  variant: z.enum(MISTRAL_VARIANTS).optional().meta({
    title: "Service",
    description:
      "Mistral's own API (native) or its deployment on Azure AI Foundry (azure).",
    "x-default": "native",
  }),
  documentAnnotationPrompt: z.string().optional().meta({
    title: "Annotation prompt",
    description: "Instruction for the whole document, sent with the request.",
    "x-widget": "textarea",
  }),
  fieldDescriptions: z.record(z.string(), z.string()).optional().meta({
    title: "Field descriptions",
    description:
      "A description for each field, keyed by field key. Azure service only.",
    "x-widget": "json",
  }),
  numericFieldsNullable: z.boolean().optional().meta({
    title: "Blank numbers are null",
    description:
      "Let the model return null, not 0, for a numeric field left blank. Azure service only.",
    "x-default": false,
  }),
  ocr3Features: z
    .object({
      tableFormat: z.literal("html").optional(),
      bboxAnnotationFormat: z.record(z.string(), z.unknown()).optional(),
      imageMinSize: z.number().int().min(1).optional(),
      imageLimit: z.number().int().min(1).optional(),
    })
    .optional()
    .meta({
      title: "OCR 3 features",
      description:
        'Mistral OCR 3 options passed through as given: tableFormat ("html"), bboxAnnotationFormat, imageMinSize and imageLimit. Azure service only.',
      "x-widget": "json",
    }),
});

export type MistralOcrProcessParameters = z.infer<
  typeof mistralOcrProcessParametersSchema
>;

export const mistralOcrProcessCatalogEntry: ActivityCatalogEntry = {
  activityType: "mistralOcr.process",
  displayName: "Process with Mistral OCR",
  category: "OCR (Mistral)",
  description:
    "Runs Mistral Document AI OCR synchronously and returns a canonical OCR result.",
  iconHint: "upload-arrow",
  colorHint: "blue",
  inputs: [
    {
      name: "fileData",
      label: "Prepared file data",
      description: "Output from Prepare File.",
      required: true,
      kind: "PreparedFile",
    },
    {
      name: "templateModelId",
      label: "Template model ID",
      description: "Optional labeling template for document annotation.",
      required: false,
      kind: "ModelId",
    },
  ],
  outputs: [
    {
      name: "ocrResult",
      label: "OCR result",
      description: "Canonical OCR result from Mistral.",
      required: true,
      kind: "OcrResult",
    },
    {
      name: "ocrResponse",
      label: "OCR response",
      description: "Raw Mistral OCR API response.",
      required: true,
      kind: "Artifact",
    },
  ],
  parametersSchema: mistralOcrProcessParametersSchema,
};
