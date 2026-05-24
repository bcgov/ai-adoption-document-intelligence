import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

export const azureClassifyPollParametersSchema = z.object({});

export const azureClassifyPollCatalogEntry: ActivityCatalogEntry = {
  activityType: "azureClassify.poll",
  displayName: "Poll Classify",
  category: "OCR (Azure)",
  description:
    "Polls Azure Document Intelligence for classifier results, mapping detected documents to page ranges by label.",
  iconHint: "hourglass",
  colorHint: "teal",
  inputs: [
    {
      name: "resultId",
      label: "Result ID",
      description: "Operation result ID from azureClassify.submit.",
      required: true,
      kind: "Artifact",
    },
    {
      name: "modelId",
      label: "Classifier model ID",
      description: "Classifier model ID.",
      required: true,
      kind: "Artifact",
    },
    {
      name: "blobKey",
      label: "Blob key (forwarded)",
      description: "Original blob key.",
      required: false,
      kind: "Document",
    },
    {
      name: "groupId",
      label: "Group ID (forwarded)",
      description: "Group ID.",
      required: false,
      kind: "Artifact",
    },
    {
      name: "documentId",
      label: "Document ID (forwarded)",
      description: "Document ID if provided upstream.",
      required: false,
      kind: "Artifact",
    },
  ],
  outputs: [
    {
      name: "labeledDocuments",
      label: "Labeled documents",
      description:
        "Map of classifier label → array of detected documents with page ranges.",
      required: true,
      kind: "Classification",
    },
    {
      name: "originalBlobKey",
      label: "Original blob key",
      description: "Original blob key (echoed).",
      required: true,
      kind: "Document",
    },
    {
      name: "groupId",
      label: "Group ID (forwarded)",
      description: "Group ID forwarded for downstream nodes.",
      required: true,
      kind: "Artifact",
    },
    {
      name: "documentId",
      label: "Document ID (forwarded)",
      description: "Document ID if provided upstream.",
      required: false,
      kind: "Artifact",
    },
  ],
  parametersSchema: azureClassifyPollParametersSchema,
};
