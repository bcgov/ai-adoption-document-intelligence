import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

export const documentNormalizeOrientationParametersSchema = z.object({
  confidenceThreshold: z
    .number()
    .min(0)
    .optional()
    .meta({
      title: "OSD confidence threshold",
      description:
        "Minimum Tesseract OSD confidence required before applying a rotation correction.",
      "x-default": 2.0,
      "x-step": 0.1,
    }),
});

export const documentNormalizeOrientationCatalogEntry: ActivityCatalogEntry = {
  activityType: "document.normalizeOrientation",
  displayName: "Correct Orientation",
  category: "Document Handling",
  description:
    "Detects sideways or upside-down pages (Tesseract OSD) and rewrites the PDF with pages rotated upright.",
  iconHint: "compass",
  colorHint: "indigo",
  inputs: [
    {
      name: "blobKey",
      label: "Normalized PDF blob key",
      description: "Storage key for the PDF to inspect.",
      required: true,
    },
  ],
  outputs: [
    {
      name: "correctedBlobKey",
      label: "Corrected blob key",
      description:
        "Storage key of the possibly corrected PDF. Same as input when no corrections were needed.",
      required: true,
    },
    {
      name: "pageCorrections",
      label: "Page corrections",
      description: "Per-page detection details and applied rotations.",
      required: false,
    },
  ],
  parametersSchema: documentNormalizeOrientationParametersSchema,
};
