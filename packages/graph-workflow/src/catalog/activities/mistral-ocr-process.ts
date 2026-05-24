import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

export const mistralOcrProcessParametersSchema = z.object({});

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
      kind: "Document",
    },
    {
      name: "templateModelId",
      label: "Template model ID",
      description: "Optional labeling template for document annotation.",
      required: false,
      kind: "Artifact",
    },
    {
      name: "documentAnnotationPrompt",
      label: "Annotation prompt",
      description: "Optional prompt for document annotation.",
      required: false,
      kind: "Artifact",
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
  ],
  parametersSchema: mistralOcrProcessParametersSchema,
};
