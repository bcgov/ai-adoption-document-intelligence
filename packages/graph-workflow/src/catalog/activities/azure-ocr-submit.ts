/**
 * Catalog entry for `azureOcr.submit`.
 *
 * Sends a prepared document to Azure Document Intelligence and returns a
 * tracking ID. Typically follows `file.prepare` and precedes a Wait & Retry
 * (poll) node for `azureOcr.poll`.
 *
 * See docs-md/workflow-builder/WORKFLOW_NODE_CATALOG.md → "Submit OCR".
 */

import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

const AZURE_LOCALES = [
  "en-US",
  "en-GB",
  "en-CA",
  "fr-CA",
  "fr-FR",
  "es-ES",
  "de-DE",
  "ja-JP",
  "zh-Hans",
] as const;

export const azureOcrSubmitParametersSchema = z.object({
  locale: z
    .enum(AZURE_LOCALES)
    .optional()
    .meta({
      title: "Locale",
      description: "Language hint for OCR. Defaults to en-US if unset.",
      "x-default": "en-US",
    }),
});

export const azureOcrSubmitCatalogEntry: ActivityCatalogEntry = {
  activityType: "azureOcr.submit",
  displayName: "Submit OCR",
  category: "OCR (Azure)",
  description:
    "Sends a prepared document to Azure Document Intelligence and returns a tracking ID.",
  iconHint: "upload",
  colorHint: "blue",
  // Non-deterministic: each call creates a new Azure operation, so two
  // invocations with identical inputs produce different `apimRequestId`s.
  // Skipping the cache decorator avoids polluting the cache with values
  // that can never be replayed safely. See US-134 + TRY_IN_PLACE_DESIGN.md §2.6.
  nonCacheable: true,
  inputs: [
    {
      name: "fileData",
      label: "Prepared file data",
      description: "Output from `file.prepare`.",
      required: true,
      kind: "Document",
    },
  ],
  outputs: [
    {
      name: "apimRequestId",
      label: "Request ID",
      description: "Azure tracking ID for this submission.",
      required: true,
      kind: "Artifact",
    },
    {
      name: "statusCode",
      label: "Submission status code",
      description: "HTTP status code (typically 202).",
      required: false,
      kind: "Artifact",
    },
    {
      name: "headers",
      label: "Submission headers",
      description: "Raw response headers, if needed downstream.",
      required: false,
      kind: "Artifact",
    },
  ],
  parametersSchema: azureOcrSubmitParametersSchema,
};
