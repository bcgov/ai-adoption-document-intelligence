/**
 * Catalog entry for `file.prepare`.
 *
 * Validates and prepares a file's metadata for further processing.
 * Typically the first node in any OCR workflow, after the workflow has been
 * triggered with a file reference.
 *
 * See docs-md/workflow-builder/WORKFLOW_NODE_CATALOG.md → "Prepare File".
 */

import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

const AZURE_PREBUILT_MODELS = [
  "prebuilt-layout",
  "prebuilt-read",
  "prebuilt-document",
  "prebuilt-receipt",
  "prebuilt-invoice",
  "prebuilt-businessCard",
  "prebuilt-tax.us.w2",
  "prebuilt-tax.us.1098",
  "prebuilt-tax.us.1099",
  "prebuilt-idDocument",
  "prebuilt-healthInsuranceCard.us",
] as const;

export const filePrepareParametersSchema = z.object({
  modelId: z
    .string()
    .optional()
    .meta({
      title: "OCR model",
      description:
        "Which Azure Document Intelligence model the prepared data should be associated with.",
      // Free-text fallback — the suggestions act as a combobox dropdown
      // but custom model IDs are also accepted.
      examples: [...AZURE_PREBUILT_MODELS],
      "x-widget": "combobox",
      "x-options": [...AZURE_PREBUILT_MODELS],
      "x-default": "prebuilt-layout",
    }),
});

export const filePrepareCatalogEntry: ActivityCatalogEntry = {
  activityType: "file.prepare",
  displayName: "Prepare File",
  category: "File Handling",
  description:
    "Validates and prepares a file's metadata for OCR submission. Use as the first step in any OCR workflow.",
  iconHint: "file",
  colorHint: "blue",
  inputs: [
    {
      name: "documentId",
      label: "Document ID",
      description: "Identifier of the document being processed.",
      required: true,
    },
    {
      name: "blobKey",
      label: "File reference (blob key)",
      description: "Storage key for the file to prepare.",
      required: true,
    },
    {
      name: "fileName",
      label: "File name",
      description: "Original file name. Derived from the blob key if omitted.",
      required: false,
    },
    {
      name: "fileType",
      label: "File type",
      description: "`pdf` or `image`. Auto-detected from the extension if omitted.",
      required: false,
    },
    {
      name: "contentType",
      label: "Content type (MIME)",
      description: "Auto-detected from the file extension if omitted.",
      required: false,
    },
  ],
  outputs: [
    {
      name: "preparedData",
      label: "Prepared file data",
      description: "Object describing the validated file, ready for OCR submission.",
      required: true,
    },
  ],
  parametersSchema: filePrepareParametersSchema,
};
