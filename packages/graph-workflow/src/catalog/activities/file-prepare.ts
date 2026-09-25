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

/**
 * No parameters. The OCR model is an input rather than a typed-in setting:
 * Azure keeps an analysis under the model it was submitted to, so this step
 * (whose output Submit OCR sends), Wait for OCR Result and Extract OCR Result
 * must all use the same model. Binding all three to one workflow variable is
 * what keeps them in step.
 */
export const filePrepareParametersSchema = z.object({});

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
      kind: "DocumentId",
    },
    {
      name: "blobKey",
      label: "File reference (blob key)",
      description: "Storage key for the file to prepare.",
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
        "Which Azure DI model the file is submitted to. Bind it to the same variable as Wait for OCR Result and Extract OCR Result. Optional — the runtime defaults to `prebuilt-layout` when unbound.",
      required: false,
      kind: "ModelId",
    },
  ],
  outputs: [
    {
      name: "preparedData",
      label: "Prepared file data",
      description:
        "Object describing the validated file, ready for OCR submission.",
      required: true,
      kind: "PreparedFile",
    },
  ],
  parametersSchema: filePrepareParametersSchema,
};
