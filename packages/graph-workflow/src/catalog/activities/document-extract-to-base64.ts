import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

export const documentExtractToBase64ParametersSchema = z.object({});

export const documentExtractToBase64CatalogEntry: ActivityCatalogEntry = {
  activityType: "document.extractToBase64",
  displayName: "Extract Pages to Base64",
  category: "File Handling",
  description:
    "Extracts a page range from a PDF blob and returns the result as a base64-encoded string.",
  iconHint: "scissors",
  colorHint: "blue",
  inputs: [
    {
      name: "blobKey",
      label: "Source blob key",
      description: "Storage key for the source PDF.",
      required: true,
      kind: "Document",
    },
    {
      name: "startPage",
      label: "Start page",
      description: "First page to extract (1-based, inclusive).",
      required: true,
      kind: "Artifact",
    },
    {
      name: "endPage",
      label: "End page",
      description: "Last page to extract (1-based, inclusive).",
      required: true,
      kind: "Artifact",
    },
  ],
  outputs: [
    {
      name: "base64",
      label: "Base64",
      description: "Base64-encoded extracted PDF.",
      required: true,
      kind: "Artifact",
    },
    {
      name: "pageCount",
      label: "Page count",
      description: "Number of pages in the extracted PDF.",
      required: true,
      kind: "Artifact",
    },
  ],
  parametersSchema: documentExtractToBase64ParametersSchema,
};
