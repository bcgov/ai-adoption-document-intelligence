import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

export const documentExtractToBase64ParametersSchema = z.object({});

export const documentExtractToBase64CatalogEntry: ActivityCatalogEntry = {
  activityType: "document.extractToBase64",
  // NB: NOT "Extract Page Range" — that is document.extractPageRange's name.
  // The persisted activityType keeps the legacy "toBase64" id, but this writes
  // one page range to a NEW blob and returns its blob path.
  displayName: "Extract Page to Blob",
  category: "File Handling",
  description:
    "Extracts a page range from a PDF blob and writes it to blob storage, returning the new blob path.",
  iconHint: "scissors",
  colorHint: "blue",
  inputs: [
    {
      name: "blobKey",
      label: "Source blob key",
      description: "Storage key for the source PDF.",
      required: true,
      kind: "DocumentRef",
    },
    {
      name: "startPage",
      label: "Start page",
      description: "First page to extract (1-based, inclusive).",
      required: true,
      kind: "Artifact",
    },
    {
      name: "endPage",
      label: "End page",
      description: "Last page to extract (1-based, inclusive).",
      required: true,
      kind: "Artifact",
    },
  ],
  outputs: [
    {
      name: "pageBlobPath",
      label: "Page blob path",
      description: "Blob path of the extracted page-range PDF.",
      required: true,
      kind: "DocumentRef",
    },
    {
      name: "pageIndex",
      label: "Page index",
      description: "First extracted page number (1-based).",
      required: true,
      kind: "Artifact",
    },
    {
      name: "byteLength",
      label: "Byte length",
      description: "Size of the written PDF in bytes.",
      required: true,
      kind: "Artifact",
    },
    {
      name: "pageCount",
      label: "Page count",
      description: "Number of pages in the extracted PDF.",
      required: true,
      kind: "Artifact",
    },
  ],
  parametersSchema: documentExtractToBase64ParametersSchema,
};
