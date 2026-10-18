import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

const CU_AUTH_MODES = ["subscription-key", "bearer"] as const;

// Mirrors `AzureCuAnalyzeParams` in
// apps/temporal/src/ocr-providers/azure-content-understanding/azure-cu-analyze.ts,
// less the values that arrive as inputs (`fileData`, `templateModelId`) and the
// ones the engine supplies (`groupId`, `requestId`).
export const azureContentUnderstandingAnalyzeParametersSchema = z.object({
  documentAnnotationPrompt: z.string().optional().meta({
    title: "Annotation prompt",
    description:
      "Instruction for the whole document, set as the analyzer's description.",
    "x-widget": "textarea",
  }),
  fieldDescriptions: z.record(z.string(), z.string()).optional().meta({
    title: "Field descriptions",
    description:
      "A description for each field, keyed by field key, attached to that field of the analyzer.",
    "x-widget": "json",
  }),
  numericFieldsNullable: z.boolean().optional().meta({
    title: "Blank numbers are null",
    description:
      "Tell the model to return null, not 0, for a numeric field left blank.",
    "x-default": false,
  }),
  analyzerId: z.string().optional().meta({
    title: "Analyzer ID",
    description:
      "Run this analyzer instead of one built from the template: an Azure prebuilt-* analyzer or one of the group's own.",
  }),
  baseAnalyzerId: z.string().optional().meta({
    title: "Base analyzer",
    description: "The analyzer that one built from the template extends.",
    "x-default": "prebuilt-document",
  }),
  authMode: z.enum(CU_AUTH_MODES).optional().meta({
    title: "Authentication",
    description: "How the worker authenticates to Content Understanding.",
    "x-default": "subscription-key",
  }),
  pollIntervalMs: z.number().int().min(1).optional().meta({
    title: "Poll interval (ms)",
    description: "Time between checks on a running analysis.",
    "x-default": 1500,
  }),
  pollMaxAttempts: z.number().int().min(1).optional().meta({
    title: "Maximum checks",
    description: "Checks on a running analysis before the step gives up.",
    "x-default": 240,
  }),
});

export type AzureContentUnderstandingAnalyzeParameters = z.infer<
  typeof azureContentUnderstandingAnalyzeParametersSchema
>;

export const azureContentUnderstandingAnalyzeCatalogEntry: ActivityCatalogEntry =
  {
    activityType: "azureContentUnderstanding.analyze",
    displayName: "Analyze with Content Understanding",
    category: "OCR (Azure)",
    description:
      "Runs an Azure Content Understanding analyzer on the document and returns a canonical OCR result. Given a template model, it first deploys an analyzer built from the template's fields.",
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
        description: "Labeling template whose fields the analyzer extracts.",
        required: false,
        kind: "ModelId",
      },
    ],
    outputs: [
      {
        name: "ocrResult",
        label: "OCR result",
        description: "Canonical OCR result from Content Understanding.",
        required: true,
        kind: "OcrResult",
      },
      {
        name: "ocrResponse",
        label: "OCR response",
        description: "Raw Content Understanding response.",
        required: true,
        kind: "Artifact",
      },
    ],
    parametersSchema: azureContentUnderstandingAnalyzeParametersSchema,
  };
