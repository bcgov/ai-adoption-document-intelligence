/**
 * Catalog entry for `azureOcr.analyze`.
 *
 * One-step "Extract Text (Azure)": prepares the file, submits it to Azure
 * Document Intelligence, waits for the result and extracts it. The granular
 * steps (`file.prepare`, `azureOcr.submit`, `azureOcr.poll`,
 * `azureOcr.extract`) remain available under the palette's Advanced section.
 */

import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";
import { azureOcrSubmitParametersSchema } from "./azure-ocr-submit";
import {
  AZURE_ANALYZE_START_TO_CLOSE,
  azurePollTimingShape,
} from "./azure-poll-timing";

export const azureOcrAnalyzeParametersSchema = z.object({
  locale: azureOcrSubmitParametersSchema.shape.locale,
  ...azurePollTimingShape,
});

export const azureOcrAnalyzeCatalogEntry: ActivityCatalogEntry = {
  activityType: "azureOcr.analyze",
  displayName: "Extract Text (Azure)",
  category: "OCR (Azure)",
  description:
    "Extracts text from a document with Azure Document Intelligence in one step: prepares the file, submits it, waits for Azure and returns the structured OCR result.",
  iconHint: "document",
  colorHint: "blue",
  // Cacheable like `azureOcr.extract` and `azureClassify.poll`, so the editor
  // can show this node's output after a Try run.
  // Benchmark runs inject the OCR replay cache so submit and poll can
  // short-circuit inside this activity.
  benchmarkOcrCacheRole: "passthrough",
  defaultStartToClose: AZURE_ANALYZE_START_TO_CLOSE,
  // `documentId` and `groupId` are not inputs: the engine injects both from the
  // run itself, so the only thing to wire from an upload node is the file
  // reference.
  inputs: [
    {
      name: "blobKey",
      label: "File reference (blob key)",
      description: "Storage key for the file to extract text from.",
      required: true,
      kind: "DocumentRef",
    },
    {
      name: "fileName",
      label: "File name",
      description: "Original file name. Derived from the blob key if omitted.",
      required: false,
      kind: "Artifact",
    },
    {
      name: "fileType",
      label: "File type",
      description:
        "`pdf` or `image`. Auto-detected from the extension if omitted.",
      required: false,
      kind: "Artifact",
    },
    {
      name: "contentType",
      label: "Content type (MIME)",
      description: "Auto-detected from the file extension if omitted.",
      required: false,
      kind: "Artifact",
    },
    {
      name: "modelId",
      label: "OCR model ID",
      description:
        "Which Azure DI model to use. Optional — the runtime defaults to `prebuilt-layout` when unbound.",
      required: false,
      kind: "ModelId",
    },
  ],
  outputs: [
    {
      name: "ocrResult",
      label: "OCR result",
      description:
        "Structured OCR result with pages, paragraphs, key-value pairs, confidence scores.",
      required: true,
      kind: "OcrResult",
    },
    {
      name: "apimRequestId",
      label: "Request ID",
      description: "Azure tracking ID for this analysis.",
      required: false,
      kind: "RequestId",
    },
  ],
  parametersSchema: azureOcrAnalyzeParametersSchema,
};
