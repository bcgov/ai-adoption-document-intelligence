import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

export const blobReadParametersSchema = z.object({});

export const blobReadCatalogEntry: ActivityCatalogEntry = {
  activityType: "blob.read",
  displayName: "Read Blob",
  category: "File Handling",
  description:
    "Reads a blob from storage and returns its contents as a base64 string.",
  iconHint: "file-download",
  colorHint: "blue",
  inputs: [
    {
      name: "blobKey",
      label: "Blob key",
      description: "Storage key for the blob to read.",
      required: true,
      kind: "Document",
    },
  ],
  outputs: [
    {
      name: "base64",
      label: "Base64",
      description: "Base64-encoded file contents.",
      required: true,
      kind: "Document",
    },
  ],
  parametersSchema: blobReadParametersSchema,
};
