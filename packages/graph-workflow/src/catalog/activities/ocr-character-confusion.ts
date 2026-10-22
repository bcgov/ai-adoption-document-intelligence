import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

// The rule ids of `BUILT_IN_CONFUSION_RULES` in
// apps/temporal/src/activities/ocr-character-confusion.ts.
const BUILT_IN_RULES = [
  "oToZero",
  "ilToOne",
  "ssToFive",
  "bToEight",
  "gToSix",
  "zToTwo",
  "qToNine",
  "slashToOne",
] as const;

export const ocrCharacterConfusionParametersSchema = z.object({
  documentType: z.string().optional().meta({
    title: "Document type",
    description: "Template model ID for field-type-aware rules.",
    "x-widget": "documentTypePicker",
  }),
  confusionProfileId: z.string().optional().meta({
    title: "Confusion profile",
    description:
      "A saved confusion profile. When set, its map replaces the custom map and the built-in rules.",
    "x-widget": "confusionProfilePicker",
  }),
  enabledRules: z
    .array(z.enum(BUILT_IN_RULES))
    .optional()
    .meta({
      title: "Enabled rules",
      description:
        "Only these built-in rules run. Empty means all of them. Numeric and date fields only, unless applied to all fields.",
      "x-widget": "multi-select-combobox",
      "x-options": [...BUILT_IN_RULES],
    }),
  disabledRules: z
    .array(z.enum(BUILT_IN_RULES))
    .optional()
    .meta({
      title: "Disabled rules",
      description: "Built-in rules to skip.",
      "x-widget": "multi-select-combobox",
      "x-options": [...BUILT_IN_RULES],
    }),
  confusionMapOverride: z.record(z.string(), z.string()).optional().meta({
    title: "Custom confusion map",
    description:
      'Replaces the built-in rules with this map of misread character to replacement (e.g., { "€": "E" }).',
    "x-widget": "confusion-map-editor",
  }),
  fieldScope: z.array(z.string().min(1)).optional().meta({
    title: "Field scope",
    description: "Restrict to specific field names.",
    "x-widget": "multi-select-combobox",
  }),
  applyToAllFields: z.boolean().optional().meta({
    title: "Apply to all fields",
    description:
      "By default rules apply only to numeric/date fields. Toggle on to apply broadly.",
    "x-default": false,
  }),
});

export type OcrCharacterConfusionParameters = z.infer<
  typeof ocrCharacterConfusionParametersSchema
>;

export const ocrCharacterConfusionCatalogEntry: ActivityCatalogEntry = {
  activityType: "ocr.characterConfusion",
  displayName: "Character Confusion Fix",
  category: "OCR Cleanup & Correction",
  description:
    "Fixes common OCR misreads (O→0, l→1, S→5, etc.) using a confusion map.",
  iconHint: "swap",
  colorHint: "teal",
  inputs: [
    {
      name: "ocrResult",
      label: "OCR result",
      description: "OCR result to correct.",
      required: true,
      kind: "OcrResult",
    },
  ],
  outputs: [
    {
      name: "ocrResult",
      label: "Corrected result",
      description: "OCR result with character-confusion fixes applied.",
      required: true,
      kind: "OcrResult",
    },
    {
      name: "changes",
      label: "Corrections",
      description: "List of corrections applied.",
      required: false,
      kind: "Artifact",
    },
  ],
  parametersSchema: ocrCharacterConfusionParametersSchema,
};
