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
  emptyValueCoercion: z.enum(EMPTY_VALUE_COERCION).optional().meta({
    title: "Empty value coercion",
    description: "How to handle empty field values: none / blank ('') / null.",
    "x-default": "none",
  }),
  normalizeFullResult: z.boolean().optional().meta({
    title: "Normalize the full text",
    description:
      "Also apply the rules to the document's full text, not only its fields.",
    "x-default": false,
  }),
  normalizeWhitespace: z.boolean().optional().meta({
    title: "Whitespace normalization",
    description:
      "Turn off to skip the whitespace rule, the same as listing it under Disabled rules.",
    "x-default": true,
  }),
  normalizeDigitGrouping: z.boolean().optional().meta({
    title: "Digit grouping cleanup",
    description:
      "Turn off to skip the digit grouping rule, the same as listing it under Disabled rules.",
    "x-default": true,
  }),
  normalizeDateSeparators: z.boolean().optional().meta({
    title: "Date separator standardization",
    description:
      "Turn off to skip the date separator rule, the same as listing it under Disabled rules.",
    "x-default": true,
  }),
  singleCharacterToZero: z.boolean().optional().meta({
    title: "Single character to zero",
    description:
      'Turn a field value left as one character by the other rules into "0", for a stray mark misread into a number. With a document type, only number fields; without one, applicant_ and spouse_ fields.',
    "x-default": false,
  }),
  singleCharacterToZeroFields: z.array(z.string().min(1)).optional().meta({
    title: "Single-character-to-zero fields",
    description:
      "Only these field keys, instead of the fields chosen by type or name.",
  }),
});

export type OcrNormalizeFieldsParameters = z.infer<
  typeof ocrNormalizeFieldsParametersSchema
>;

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
      kind: "OcrResult",
    },
  ],
  outputs: [
    {
      name: "ocrResult",
      label: "Normalized result",
      description: "OCR result with normalized field values.",
      required: true,
      kind: "OcrResult",
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
