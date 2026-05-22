import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

export const documentExtractPageRangeParametersSchema = z.object({});

export const documentExtractPageRangeCatalogEntry: ActivityCatalogEntry = {
  activityType: "document.extractPageRange",
  displayName: "Extract Page Range",
  category: "Document Handling",
  description:
    "Extracts a specific page range from a source PDF and writes it as a new blob segment.",
  iconHint: "scissors",
  colorHint: "indigo",
  inputs: [
    {
      name: "blobKey",
      label: "Source file reference (blob key)",
      description: "Storage key for the source PDF.",
      required: true,
    },
    {
      name: "groupId",
      label: "Group ID",
      description: "Destination group for the extracted segment.",
      required: true,
    },
    {
      name: "pageRange",
      label: "Page range",
      description: "Object with `start` and `end` (1-based, inclusive).",
      required: true,
    },
    {
      name: "documentId",
      label: "Document ID",
      description: "Inferred from the file reference if not provided.",
      required: false,
    },
  ],
  outputs: [
    {
      name: "segmentBlobKey",
      label: "Segment blob key",
      description: "Storage key for the extracted segment file.",
      required: true,
    },
    {
      name: "pageRange",
      label: "Page range",
      description: "Echoed page range.",
      required: true,
    },
  ],
  parametersSchema: documentExtractPageRangeParametersSchema,
};
