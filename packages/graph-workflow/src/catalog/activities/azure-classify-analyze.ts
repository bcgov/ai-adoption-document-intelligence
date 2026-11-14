/**
 * Catalog entry for `azureClassify.analyze`.
 *
 * One-step "Classify Document (Azure)": submits the document to an Azure
 * classifier and waits for the labelled page ranges. The granular steps
 * (`azureClassify.submit`, `azureClassify.poll`) remain available under the
 * palette's Advanced section.
 */

import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";
import { azureClassifySubmitParametersSchema } from "./azure-classify-submit";
import {
  AZURE_ANALYZE_START_TO_CLOSE,
  azurePollTimingShape,
} from "./azure-poll-timing";

export const azureClassifyAnalyzeParametersSchema = z.object({
  classifierName: azureClassifySubmitParametersSchema.shape.classifierName,
  ...azurePollTimingShape,
});

export const azureClassifyAnalyzeCatalogEntry: ActivityCatalogEntry = {
  activityType: "azureClassify.analyze",
  displayName: "Classify Document (Azure)",
  category: "Document Handling",
  description:
    "Classifies a document with an Azure Document Intelligence classifier in one step: submits it, waits for Azure and returns the detected documents by label with their page ranges.",
  iconHint: "tag",
  colorHint: "blue",
  // Cacheable like `azureOcr.extract` and `azureClassify.poll`, so the editor
  // can show this node's output after a Try run.
  defaultStartToClose: AZURE_ANALYZE_START_TO_CLOSE,
  // `documentId` and `groupId` are injected by the engine from the run.
  inputs: [
    {
      name: "blobKey",
      label: "Document blob key",
      description: "Storage key for the document to classify.",
      required: true,
      kind: "DocumentRef",
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
  parametersSchema: azureClassifyAnalyzeParametersSchema,
};
