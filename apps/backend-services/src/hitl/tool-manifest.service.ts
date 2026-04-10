/**
 * Tool Manifest Service
 *
 * Exposes the OCR correction tools manifest for consumption by the AI
 * recommendation pipeline and internal tooling. Duplicates
 * `apps/temporal/src/correction-tool-registry.ts` so the API does not import the
 * worker package; keep entries aligned with that file (or extract a shared package).
 *
 * See feature-docs/008-ocr-correction-agentic-sdlc/step-03-ai-hitl-processing-tool-selection.md
 */

import { Injectable } from "@nestjs/common";

export interface ToolParamSchema {
  name: string;
  type: "string" | "number" | "boolean" | "string[]" | "object";
  description: string;
  required: boolean;
  default?: unknown;
}

export interface ToolManifestEntry {
  toolId: string;
  label: string;
  description: string;
  parameters: ToolParamSchema[];
  tags: string[];
}

const TOOL_MANIFEST: ToolManifestEntry[] = [
  {
    toolId: "ocr.spellcheck",
    label: "Spellcheck Correction",
    description:
      "Dictionary-based spellcheck on OCR field values. Corrects misspelled words using an English dictionary.",
    parameters: [
      {
        name: "language",
        type: "string",
        description: "Language code for dictionary selection",
        required: false,
        default: "en",
      },
      {
        name: "fieldScope",
        type: "string[]",
        description: "Restrict spellcheck to specific field keys.",
        required: false,
      },
    ],
    tags: ["spelling", "text", "dictionary"],
  },
  {
    toolId: "ocr.characterConfusion",
    label: "Character Confusion Correction",
    description:
      "Character-level confusion map on field values. Optional documentType loads field_schema for type-aware rule subsets. Built-in rule IDs: oToZero, ilToOne, ssToFive, bToEight, gToSix, zToTwo, qToNine, slashToOne — use enabledRules/disabledRules; confusionMapOverride replaces the built-in map.",
    parameters: [
      {
        name: "documentType",
        type: "string",
        description:
          "LabelingProject id — load field_schema for per-field_type rule subsets (same as ocr.normalizeFields).",
        required: false,
      },
      {
        name: "enabledRules",
        type: "string[]",
        description:
          "Optional list of built-in confusion rule IDs. Defaults to all when omitted.",
        required: false,
      },
      {
        name: "disabledRules",
        type: "string[]",
        description:
          "Built-in rule IDs to skip. Ignored when confusionMapOverride is set.",
        required: false,
      },
      {
        name: "confusionMapOverride",
        type: "object",
        description:
          "Custom confusion map as Record<string, string>. Replaces built-in rules; enabled/disabled toggles ignored.",
        required: false,
      },
      {
        name: "applyToAllFields",
        type: "boolean",
        description: "Apply to all fields, not just date/number-like.",
        required: false,
        default: false,
      },
      {
        name: "fieldScope",
        type: "string[]",
        description: "Restrict to specific field keys.",
        required: false,
      },
    ],
    tags: ["character", "confusion", "digits"],
  },
  {
    toolId: "ocr.normalizeFields",
    label: "Field Normalization",
    description:
      "Deterministic normalization: whitespace, digit grouping, date separators. Optional documentType (LabelingProject id) enables schema-aware rule selection per field_type.",
    parameters: [
      {
        name: "documentType",
        type: "string",
        description:
          "LabelingProject id — load field_schema; string fields skip thousands/currency rules, date type enables calendar canonicalization.",
        required: false,
      },
      {
        name: "enabledRules",
        type: "string[]",
        description:
          "Optional ordered list of normalizer rule IDs to run. Defaults to all built-in rules.",
        required: false,
      },
      {
        name: "disabledRules",
        type: "string[]",
        description:
          "Optional list of normalizer rule IDs to skip. Takes precedence over enabledRules.",
        required: false,
      },
      {
        name: "normalizeFullResult",
        type: "boolean",
        description:
          "When true, normalize full OCR text regions (pages, paragraphs, tables, sections, figures) in addition to field values.",
        required: false,
        default: false,
      },
      {
        name: "fieldScope",
        type: "string[]",
        description:
          "Restrict normalization rules to these keys; emptyValueCoercion applies to all fields in the OCR result.",
        required: false,
      },
      {
        name: "emptyValueCoercion",
        type: "string",
        description:
          'After rules, coerce empty fields (all OCR fields, not fieldScope-limited): "none" (default), "blank" ("" for benchmark GT), or "null".',
        required: false,
        default: "none",
      },
    ],
    tags: ["whitespace", "formatting", "normalization"],
  },
];

@Injectable()
export class ToolManifestService {
  getManifest(): ToolManifestEntry[] {
    return TOOL_MANIFEST;
  }
}
