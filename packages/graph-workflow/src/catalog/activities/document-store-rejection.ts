import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

export const documentStoreRejectionParametersSchema = z.object({});

export const documentStoreRejectionCatalogEntry: ActivityCatalogEntry = {
  activityType: "document.storeRejection",
  displayName: "Store Rejection",
  category: "Storage",
  description:
    "Records rejection data when a document fails processing or human review.",
  iconHint: "no-entry",
  colorHint: "gray",
  inputs: [
    {
      name: "documentId",
      label: "Document ID",
      description: "Identifier of the rejected document.",
      required: true,
    },
    {
      name: "reason",
      label: "Reason",
      description: "Rejection reason.",
      required: true,
    },
    {
      name: "reviewer",
      label: "Reviewer",
      description: "Reviewer name or ID.",
      required: false,
    },
    {
      name: "annotations",
      label: "Annotations",
      description: "Annotation notes captured at rejection time.",
      required: false,
    },
  ],
  outputs: [],
  parametersSchema: documentStoreRejectionParametersSchema,
};
