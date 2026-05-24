import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

const DOCUMENT_STATUSES = [
  "pending",
  "ongoing_ocr",
  "awaiting_review",
  "completed",
  "rejected",
] as const;

export const documentUpdateStatusParametersSchema = z.object({
  status: z
    .string()
    .meta({
      title: "Status",
      description: "Status value to set on the document.",
      "x-widget": "combobox",
      "x-options": [...DOCUMENT_STATUSES],
      "x-default": "ongoing_ocr",
    }),
});

export const documentUpdateStatusCatalogEntry: ActivityCatalogEntry = {
  activityType: "document.updateStatus",
  displayName: "Update Document Status",
  category: "Storage",
  description: "Updates a document's processing status in the database.",
  iconHint: "status-tag",
  colorHint: "gray",
  inputs: [
    {
      name: "documentId",
      label: "Document ID",
      description: "Identifier of the document being updated.",
      required: true,
      kind: "Artifact",
    },
    {
      name: "apimRequestId",
      label: "APIM request ID",
      description: "Azure request tracking ID.",
      required: false,
      kind: "Artifact",
    },
  ],
  outputs: [],
  parametersSchema: documentUpdateStatusParametersSchema,
};
