import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

export const azureClassifySubmitParametersSchema = z.object({});

export const azureClassifySubmitCatalogEntry: ActivityCatalogEntry = {
  activityType: "azureClassify.submit",
  displayName: "Submit Classify",
  category: "OCR (Azure)",
  description:
    "Submits a document to Azure Document Intelligence for classifier-based page classification.",
  iconHint: "upload",
  colorHint: "blue",
  inputs: [
    {
      name: "blobKey",
      label: "Document blob key",
      description: "Storage key for the document to classify.",
      required: true,
      kind: "Document",
    },
    {
      name: "groupId",
      label: "Group ID",
      description: "Group that owns the classifier.",
      required: true,
      kind: "Artifact",
    },
    {
      name: "classifierName",
      label: "Classifier name",
      description: "Name of the classifier to invoke.",
      required: true,
      kind: "Artifact",
    },
    {
      name: "documentId",
      label: "Document ID",
      description: "Inferred from the file reference if not provided.",
      required: false,
      kind: "Artifact",
    },
  ],
  outputs: [
    {
      name: "resultId",
      label: "Result ID",
      description: "Operation result ID returned by Azure.",
      required: true,
      kind: "Artifact",
    },
    {
      name: "constructedClassifierName",
      label: "Constructed classifier name",
      description: "Full classifier name (`{groupId}__{classifierName}`).",
      required: true,
      kind: "Artifact",
    },
    {
      name: "blobKey",
      label: "Blob key (forwarded)",
      description: "Original blob key forwarded for downstream nodes.",
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
      description: "Document ID if provided.",
      required: false,
      kind: "Artifact",
    },
  ],
  parametersSchema: azureClassifySubmitParametersSchema,
};
