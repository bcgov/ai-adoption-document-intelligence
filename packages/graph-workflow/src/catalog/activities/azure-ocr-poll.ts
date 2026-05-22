import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

export const azureOcrPollParametersSchema = z.object({});

export const azureOcrPollCatalogEntry: ActivityCatalogEntry = {
  activityType: "azureOcr.poll",
  displayName: "Wait for OCR Result",
  category: "OCR (Azure)",
  description:
    "Polls Azure Document Intelligence for OCR results, returning status and the raw response.",
  iconHint: "hourglass",
  colorHint: "teal",
  inputs: [
    {
      name: "apimRequestId",
      label: "APIM request ID",
      description: "Azure request ID returned by Submit OCR.",
      required: true,
    },
    {
      name: "modelId",
      label: "OCR model ID",
      description: "Which Azure DI model the OCR was submitted against.",
      required: true,
    },
  ],
  outputs: [
    {
      name: "ocrResponse",
      label: "OCR response",
      description: "Raw Azure Document Intelligence response object.",
      required: true,
    },
    {
      name: "status",
      label: "Poll status",
      description: "running | succeeded | failed.",
      required: true,
    },
  ],
  parametersSchema: azureOcrPollParametersSchema,
};
