import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

export const documentSelectClassifiedPagesParametersSchema = z.object({});

export const documentSelectClassifiedPagesCatalogEntry: ActivityCatalogEntry = {
  activityType: "document.selectClassifiedPages",
  displayName: "Select Classified Pages",
  category: "Document Handling",
  description:
    "Extracts all page-range segments for a specific classifier label from the output of azureClassify.poll.",
  iconHint: "filter",
  colorHint: "indigo",
  inputs: [
    {
      name: "labeledDocuments",
      label: "Labeled documents",
      description: "Output from azureClassify.poll (keyed by label).",
      required: true,
      kind: "Classification",
    },
    {
      name: "targetLabel",
      label: "Target label",
      description: "Classifier label to select.",
      required: true,
      kind: "Artifact",
    },
  ],
  outputs: [
    {
      name: "segments",
      label: "Segments",
      description:
        "All detected segments for the target label, sorted by pageRange.start.",
      required: true,
      kind: "Segment[]",
    },
  ],
  parametersSchema: documentSelectClassifiedPagesParametersSchema,
};
