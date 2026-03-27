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
      "Applies character-level confusion map (O→0, l→1, S→5) to values with mixed letter-digit patterns. Supports custom map override.",
    parameters: [
      {
        name: "confusionMapOverride",
        type: "object",
        description: "Custom confusion map as Record<string, string>.",
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

  getToolById(toolId: string): ToolManifestEntry | undefined {
    return TOOL_MANIFEST.find((t) => t.toolId === toolId);
  }

  getToolIds(): string[] {
    return TOOL_MANIFEST.map((t) => t.toolId);
  }

  isValidToolId(toolId: string): boolean {
    return TOOL_MANIFEST.some((t) => t.toolId === toolId);
  }
}
