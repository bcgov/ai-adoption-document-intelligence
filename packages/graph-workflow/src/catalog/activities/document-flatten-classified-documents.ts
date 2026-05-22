import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

export const documentFlattenClassifiedDocumentsParametersSchema = z.object({});

export const documentFlattenClassifiedDocumentsCatalogEntry: ActivityCatalogEntry =
  {
    activityType: "document.flattenClassifiedDocuments",
    displayName: "Flatten Classified Documents",
    category: "Document Handling",
    description:
      "Flattens the labeledDocuments map into a single sorted array of segments, optionally filtered by label.",
    iconHint: "merge",
    colorHint: "indigo",
    inputs: [
      {
        name: "labeledDocuments",
        label: "Labeled documents",
        description: "Output from azureClassify.poll (keyed by label).",
        required: true,
      },
      {
        name: "filterLabels",
        label: "Filter labels",
        description: "Optional allow-list of labels to include.",
        required: false,
      },
    ],
    outputs: [
      {
        name: "segments",
        label: "Segments",
        description:
          "Flat, page-ordered array of classified segments with their labels.",
        required: true,
      },
    ],
    parametersSchema: documentFlattenClassifiedDocumentsParametersSchema,
  };
