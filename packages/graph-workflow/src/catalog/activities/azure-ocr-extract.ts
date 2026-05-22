import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

export const azureOcrExtractParametersSchema = z.object({});

export const azureOcrExtractCatalogEntry: ActivityCatalogEntry = {
  activityType: "azureOcr.extract",
  displayName: "Extract OCR Result",
  category: "OCR (Azure)",
  description:
    "Parses the raw Azure response into a structured OCR result with fields, key-value pairs, and confidence scores.",
  iconHint: "document",
  colorHint: "blue",
  inputs: [
    {
      name: "apimRequestId",
      label: "APIM request ID",
      description: "Azure request tracking ID.",
      required: true,
    },
    {
      name: "fileName",
      label: "File name",
      description: "Original file name.",
      required: true,
    },
    {
      name: "fileType",
      label: "File type",
      description: "`pdf` or `image`.",
      required: true,
    },
    {
      name: "modelId",
      label: "OCR model ID",
      description: "Model the OCR was submitted against.",
      required: true,
    },
    {
      name: "ocrResponse",
      label: "OCR response",
      description: "Raw OCR response. Refetched if omitted.",
      required: false,
    },
  ],
  outputs: [
    {
      name: "ocrResult",
      label: "OCR result",
      description:
        "Structured OCR result with pages, paragraphs, key-value pairs, confidence scores.",
      required: true,
    },
  ],
  parametersSchema: azureOcrExtractParametersSchema,
};
