import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

// Mirrors `VlmHybridExtractParams` in
// apps/temporal/src/ocr-providers/vlm-ocr-hybrid/vlm-hybrid-extract.ts, less
// the values that arrive as inputs (`fileData`, `layoutResponse`,
// `templateModelId`, `azureOpenAiDeployment`) and the ones the engine supplies
// (`groupId`, `requestId`).
export const vlmOcrHybridExtractParametersSchema = z.object({
  documentAnnotationPrompt: z.string().optional().meta({
    title: "Annotation prompt",
    description:
      "Instruction for the whole document, sent to the model ahead of the field list.",
    "x-widget": "textarea",
  }),
  fieldDescriptions: z.record(z.string(), z.string()).optional().meta({
    title: "Field descriptions",
    description: "A description for each field, keyed by field key.",
    "x-widget": "json",
  }),
  numericFieldsNullable: z.boolean().optional().meta({
    title: "Blank numbers are null",
    description: "Ask for null, not 0, for a numeric field left blank.",
    "x-default": true,
  }),
  maxCompletionTokens: z.number().int().min(1).optional().meta({
    title: "Max completion tokens",
    description: "Upper limit on the length of the model's answer.",
    "x-default": 8192,
  }),
  includeBboxAnnotations: z.boolean().optional().meta({
    title: "Include line positions",
    description:
      "Prefix each line of the OCR text with its position on the page.",
    "x-default": false,
  }),
});

export type VlmOcrHybridExtractParameters = z.infer<
  typeof vlmOcrHybridExtractParametersSchema
>;

export const vlmOcrHybridExtractCatalogEntry: ActivityCatalogEntry = {
  activityType: "vlmOcrHybrid.extract",
  displayName: "Extract with Vision Model and OCR Text",
  category: "OCR (Azure)",
  description:
    "Sends the document image and its OCR text from Azure Document Intelligence to an Azure OpenAI vision model, which returns the template's fields as strict JSON.",
  iconHint: "sparkle-document",
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
      name: "layoutResponse",
      label: "Layout response",
      description:
        "OCR response from Wait for OCR Result, for a document submitted with markdown output.",
      required: true,
      kind: "Artifact",
    },
    {
      name: "templateModelId",
      label: "Template model ID",
      description: "Labeling template whose fields the model fills in.",
      required: false,
      kind: "ModelId",
    },
    {
      name: "azureOpenAiDeployment",
      label: "Azure OpenAI deployment",
      description:
        "Vision-capable deployment to call. Defaults to the worker's configured deployment.",
      required: false,
      kind: "ModelId",
    },
  ],
  outputs: [
    {
      name: "ocrResult",
      label: "OCR result",
      description: "Canonical OCR result built from the model's answer.",
      required: true,
      kind: "OcrResult",
    },
    {
      name: "ocrResponse",
      label: "Model response",
      description: "Raw model response, with the parsed fields.",
      required: true,
      kind: "Artifact",
    },
  ],
  parametersSchema: vlmOcrHybridExtractParametersSchema,
};
