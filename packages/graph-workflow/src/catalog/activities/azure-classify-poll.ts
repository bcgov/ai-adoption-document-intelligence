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
      name: "constructedClassifierName",
      label: "Constructed classifier name",
      description:
        "Full classifier name constructed by azureClassify.submit (`{groupId}__{classifierName}`).",
      required: true,
      kind: "Artifact",
    },
    {
      name: "blobKey",
      label: "Blob key (forwarded)",
      description: "Original blob key.",
      required: false,
      kind: "DocumentRef",
    },
    {
      name: "groupId",
      label: "Group ID (forwarded)",
      description: "Group ID.",
      required: false,
      kind: "GroupId",
    },
    {
      name: "documentId",
      label: "Document ID (forwarded)",
      description: "Document ID if provided upstream.",
      required: false,
      kind: "DocumentId",
    },
  ],
  outputs: [
    {
      name: "labeledDocuments",
      label: "Labeled documents",
      description:
        "Map of classifier label → array of detected documents with page ranges.",
      required: true,
      kind: "LabeledDocumentMap",
    },
    {
      name: "originalBlobKey",
      label: "Original blob key",
      description: "Original blob key (echoed).",
      required: true,
      kind: "DocumentRef",
    },
    {
      name: "groupId",
      label: "Group ID (forwarded)",
      description: "Group ID forwarded for downstream nodes.",
      required: true,
      kind: "GroupId",
    },
    {
      name: "documentId",
      label: "Document ID (forwarded)",
      description: "Document ID if provided upstream.",
      required: false,
      kind: "DocumentId",
    },
  ],
  parametersSchema: azureClassifyPollParametersSchema,
};
