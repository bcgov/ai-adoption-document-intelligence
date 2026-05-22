import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

const BUILT_IN_RULES = [
  "O_to_0",
  "I_to_1",
  "l_to_1",
  "S_to_5",
  "B_to_8",
  "G_to_6",
  "Z_to_2",
  "q_to_9",
  "slash_to_1",
] as const;

export const ocrCharacterConfusionParametersSchema = z.object({
  documentType: z.string().optional().meta({
    title: "Document type",
    description: "Template model ID for field-type-aware rules.",
    "x-widget": "documentTypePicker",
  }),
  confusionProfile: z.string().optional().meta({
    title: "Confusion profile",
    description:
      "Saved profile of rules — overrides the built-in default set when chosen.",
    "x-widget": "confusionProfilePicker",
  }),
  builtInRules: z
    .array(z.enum(BUILT_IN_RULES))
    .optional()
    .meta({
      title: "Built-in rules",
      description:
        "Individual character-confusion rules. Numbers-only by default.",
      "x-widget": "multi-select-combobox",
      "x-options": [...BUILT_IN_RULES],
    }),
  customConfusionMap: z
    .record(z.string(), z.string())
    .optional()
    .meta({
      title: "Custom confusion map",
      description:
        "Override or extend the built-in map (e.g., { \"€\": \"E\" }).",
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
    },
  ],
  outputs: [
    {
      name: "correctedResult",
      label: "Corrected result",
      description: "OCR result with character-confusion fixes applied.",
      required: true,
    },
    {
      name: "corrections",
      label: "Corrections",
      description: "List of corrections applied.",
      required: false,
    },
  ],
  parametersSchema: ocrCharacterConfusionParametersSchema,
};
