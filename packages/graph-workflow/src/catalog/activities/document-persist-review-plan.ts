import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

export const documentPersistReviewPlanParametersSchema = z.object({});

export const documentPersistReviewPlanCatalogEntry: ActivityCatalogEntry = {
  activityType: "document.persistReviewPlan",
  displayName: "Persist Review Plan",
  category: "OCR Quality",
  description:
    "Saves the per-field review plan from Apply Review Criteria onto the document so the review UI can default to showing only flagged fields.",
  iconHint: "save",
  colorHint: "teal",
  // DB write: a cache hit would skip it, same class as ocr.storeResults.
  // See TRY_IN_PLACE_DESIGN.md §2.6.
  nonCacheable: true,
  inputs: [
    {
      name: "documentId",
      label: "Document ID",
      description: "Identifier of the document the plan belongs to.",
      required: true,
      kind: "DocumentId",
    },
    {
      name: "reviewPlan",
      label: "Review plan",
      description: "Review plan from Apply Review Criteria.",
      required: true,
      kind: "Artifact",
    },
  ],
  outputs: [],
  parametersSchema: documentPersistReviewPlanParametersSchema,
};
