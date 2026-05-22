import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

const SPELLCHECK_LANGUAGES = ["en", "fr", "es", "de"] as const;

export const ocrSpellcheckParametersSchema = z.object({
  fieldScope: z
    .array(z.string().min(1))
    .optional()
    .meta({
      title: "Field scope",
      description:
        "Restrict spellcheck to specific field names. Leave empty to apply to all.",
      "x-widget": "multi-select-combobox",
    }),
  language: z
    .string()
    .optional()
    .meta({
      title: "Language",
      description: "Dictionary language for spellcheck.",
      "x-widget": "combobox",
      "x-options": [...SPELLCHECK_LANGUAGES],
      "x-default": "en",
    }),
});

export const ocrSpellcheckCatalogEntry: ActivityCatalogEntry = {
  activityType: "ocr.spellcheck",
  displayName: "Spellcheck",
  category: "OCR Cleanup & Correction",
  description: "Dictionary-based spellcheck on OCR field values.",
  iconHint: "spell-check",
  colorHint: "teal",
  inputs: [
    {
      name: "ocrResult",
      label: "OCR result",
      description: "OCR result to spellcheck.",
      required: true,
    },
  ],
  outputs: [
    {
      name: "correctedResult",
      label: "Corrected result",
      description: "OCR result with spellcheck corrections applied.",
      required: true,
    },
    {
      name: "corrections",
      label: "Corrections",
      description: "List of {field, original, corrected, reason}.",
      required: false,
    },
    {
      name: "metadata",
      label: "Metadata",
      description: "Counters {totalWordsChecked, totalCorrections}.",
      required: false,
    },
  ],
  parametersSchema: ocrSpellcheckParametersSchema,
};
