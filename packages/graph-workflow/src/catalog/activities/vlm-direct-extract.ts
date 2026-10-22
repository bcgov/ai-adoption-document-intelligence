import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

// Mirrors `VlmDirectExtractParams` in
// apps/temporal/src/ocr-providers/vlm-direct/vlm-direct-extract.ts, less the
// values that arrive as inputs (`fileData`, `templateModelId`,
// `azureOpenAiDeployment`) and the ones the engine supplies (`groupId`,
// `requestId`).
export const vlmDirectExtractParametersSchema = z.object({
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
});

export type VlmDirectExtractParameters = z.infer<
  typeof vlmDirectExtractParametersSchema
>;

export const vlmDirectExtractCatalogEntry: ActivityCatalogEntry = {
  activityType: "vlmDirect.extract",
  displayName: "Extract with Vision Model",
  category: "OCR (Azure)",
  description:
    "Sends the document image to an Azure OpenAI vision model, which returns the template's fields as strict JSON. Images only; a PDF fails the step.",
  iconHint: "sparkle-document",
  colorHint: "blue",
  inputs: [
    {
      name: "fileData",
      label: "Prepared file data",
      description: "Output from Prepare File. Must be an image.",
      required: true,
      kind: "PreparedFile",
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
  parametersSchema: vlmDirectExtractParametersSchema,
};
