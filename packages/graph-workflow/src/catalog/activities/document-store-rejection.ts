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
  // Writes to the documents table; skipping would mask user-visible side
  // effects. See US-134 + TRY_IN_PLACE_DESIGN.md §2.6.
  nonCacheable: true,
  inputs: [
    {
      name: "documentId",
      label: "Document ID",
      description: "Identifier of the rejected document.",
      required: true,
      kind: "Artifact",
    },
    {
      name: "reason",
      label: "Reason",
      description: "Rejection reason.",
      required: true,
      kind: "Artifact",
    },
    {
      name: "reviewer",
      label: "Reviewer",
      description: "Reviewer name or ID.",
      required: false,
      kind: "Artifact",
    },
    {
      name: "annotations",
      label: "Annotations",
      description: "Annotation notes captured at rejection time.",
      required: false,
      kind: "Artifact",
    },
  ],
  outputs: [],
  parametersSchema: documentStoreRejectionParametersSchema,
};
