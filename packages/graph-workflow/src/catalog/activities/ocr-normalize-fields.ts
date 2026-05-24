import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

const NORMALIZATION_RULES = [
  "whitespace",
  "digitGrouping",
  "dateSeparators",
  "dehyphenation",
  "commaThousands",
  "currencySpacing",
  "unicode",
] as const;

const EMPTY_VALUE_COERCION = ["none", "blank", "null"] as const;

export const ocrNormalizeFieldsParametersSchema = z.object({
  documentType: z.string().optional().meta({
    title: "Document type",
    description: "Template model ID for field-type-aware rules.",
    "x-widget": "documentTypePicker",
  }),
  enabledRules: z
    .array(z.enum(NORMALIZATION_RULES))
    .optional()
    .meta({
      title: "Enabled rules",
      description: "Explicit allow-list of normalization rules to apply.",
      "x-widget": "multi-select-combobox",
      "x-options": [...NORMALIZATION_RULES],
    }),
  disabledRules: z
    .array(z.enum(NORMALIZATION_RULES))
    .optional()
    .meta({
      title: "Disabled rules",
      description: "Explicit deny-list of normalization rules.",
      "x-widget": "multi-select-combobox",
      "x-options": [...NORMALIZATION_RULES],
    }),
  fieldScope: z.array(z.string().min(1)).optional().meta({
    title: "Field scope",
    description: "Restrict normalization to specific field names.",
    "x-widget": "multi-select-combobox",
  }),
  emptyValueCoercion: z
    .enum(EMPTY_VALUE_COERCION)
    .optional()
    .meta({
      title: "Empty value coercion",
      description:
        "How to handle empty field values: none / blank ('') / null.",
      "x-default": "none",
    }),
});

export const ocrNormalizeFieldsCatalogEntry: ActivityCatalogEntry = {
  activityType: "ocr.normalizeFields",
  displayName: "Normalize Fields",
  category: "OCR Cleanup & Correction",
  description:
    "Cleans up field values — whitespace, digit grouping, date separator standardization.",
  iconHint: "broom",
  colorHint: "teal",
  inputs: [
    {
      name: "ocrResult",
      label: "OCR result",
      description: "OCR result to normalize.",
      required: true,
      kind: "OcrFields",
    },
  ],
  outputs: [
    {
      name: "normalizedResult",
      label: "Normalized result",
      description: "OCR result with normalized field values.",
      required: true,
      kind: "OcrFields",
    },
    {
      name: "changes",
      label: "Changes",
      description: "Optional list of changes made by normalization.",
      required: false,
      kind: "Artifact",
    },
  ],
  parametersSchema: ocrNormalizeFieldsParametersSchema,
};
