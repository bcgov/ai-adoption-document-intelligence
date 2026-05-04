/**
 * OCR Correction Tool Registry
 *
 * Maintains a manifest of available OCR correction tools with their parameter
 * schemas. Consumed by the AI recommendation pipeline to select and configure tools,
 * and by documentation. Candidate insertion is fixed by the improvement pipeline
 * (first edge after structured OCR: `azureOcr.extract`, `mistralOcr.process`, …), not by per-tool metadata here.
 *
 * **Why not a single module?** The same manifest text is duplicated in
 * `apps/backend-services/src/hitl/tool-manifest.service.ts` because the Nest API
 * must not depend on the Temporal worker bundle, and the worker cannot import Nest.
 * `@ai-di/graph-insertion-slots` already shares insertion-slot math; a shared
 * `correction-tool-manifest` package would remove this duplication if desired.
 *
 * See feature-docs/008-ocr-correction-agentic-sdlc/step-02-ocr-correction-tools-and-nodes.md
 */

export interface CorrectionToolParamSchema {
  name: string;
  type: "string" | "number" | "boolean" | "string[]" | "object";
  description: string;
  required: boolean;
  default?: unknown;
}

export interface CorrectionToolManifestEntry {
  /** Activity type string (matches activity-types.ts). */
  toolId: string;

  /** Human-readable name. */
  label: string;

  /** Short description of what the tool does. */
  description: string;

  /** Accepted parameters beyond the required ocrResult. */
  parameters: CorrectionToolParamSchema[];

  /** Tags for categorization. */
  tags: string[];
}

const CORRECTION_TOOL_REGISTRY: CorrectionToolManifestEntry[] = [
  {
    toolId: "ocr.spellcheck",
    label: "Spellcheck Correction",
    description:
      "Dictionary-based spellcheck on OCR field values. Corrects misspelled words using an English dictionary. Skips numeric tokens and short abbreviations.",
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
        description:
          "Restrict spellcheck to specific field keys. Empty means all fields.",
        required: false,
      },
    ],
    tags: ["spelling", "text", "dictionary"],
  },
  {
    toolId: "ocr.characterConfusion",
    label: "Character Confusion Correction",
    description:
      "Character-level confusion map (O→0, l→1, S→5, /→1 in numeric contexts, etc.) on field values. Optional documentType loads field_schema for type-aware rule subsets (e.g. string fields omit slash→1). Built-in rules are toggled via enabledRules/disabledRules; confusionMapOverride replaces the entire built-in map (toggles ignored).",
    parameters: [
      {
        name: "documentType",
        type: "string",
        description:
          "LabelingProject id — load field_schema; per field_type intersects with enabled rules (string omits slashToOne; selectionMark/signature apply no substitutions).",
        required: false,
      },
      {
        name: "enabledRules",
        type: "string[]",
        description:
          "Optional ordered list of built-in confusion rule IDs (oToZero, ilToOne, ssToFive, bToEight, gToSix, zToTwo, qToNine, slashToOne). Defaults to all when omitted or empty.",
        required: false,
      },
      {
        name: "disabledRules",
        type: "string[]",
        description:
          "Built-in rule IDs to skip after enabledRules. Ignored when confusionMapOverride is set.",
        required: false,
      },
      {
        name: "confusionMapOverride",
        type: "object",
        description:
          "Custom confusion map as Record<string, string>. Replaces the entire built-in rule pipeline; enabledRules/disabledRules ignored. Schema gating still applies (e.g. slash entry stripped for schema string fields).",
        required: false,
      },
      {
        name: "applyToAllFields",
        type: "boolean",
        description:
          "Apply to all text fields, not just date/number-like values. Default: false",
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
    tags: ["character", "confusion", "digits", "dates"],
  },
  {
    toolId: "ocr.normalizeFields",
    label: "Field Normalization",
    description:
      "Deterministic normalization of field values: whitespace cleanup, digit grouping, date separators. Pass documentType (LabelingProject id) to load field_schema and apply rules per field_type (string vs number vs date).",
    parameters: [
      {
        name: "documentType",
        type: "string",
        description:
          "LabelingProject id — loads field_schema from DB; string fields skip number rules, date fields get calendar canonicalization even if field_key is not *_date.",
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
          "Restrict normalization rules to these field keys (emptyValueCoercion still applies to all fields present in the OCR result).",
        required: false,
      },
      {
        name: "emptyValueCoercion",
        type: "string",
        description:
          'After rules, coerce empty Azure field shapes on all OCR fields: "none" (default), "blank" (empty string for benchmark GT alignment), or "null" (JSON null content). Not limited by fieldScope.',
        required: false,
        default: "none",
      },
    ],
    tags: ["whitespace", "formatting", "normalization", "dates", "numbers"],
  },
];

/**
 * Get all registered correction tools.
 */
export function getCorrectionTools(): readonly CorrectionToolManifestEntry[] {
  return CORRECTION_TOOL_REGISTRY;
}

/**
 * Get a correction tool entry by its toolId (activityType).
 */
export function getCorrectionTool(
  toolId: string,
): CorrectionToolManifestEntry | undefined {
  return CORRECTION_TOOL_REGISTRY.find((t) => t.toolId === toolId);
}

/**
 * Get all tool IDs.
 */
export function getCorrectionToolIds(): string[] {
  return CORRECTION_TOOL_REGISTRY.map((t) => t.toolId);
}

/**
 * Validate that a tool ID is a registered correction tool.
 */
export function isRegisteredCorrectionTool(toolId: string): boolean {
  return CORRECTION_TOOL_REGISTRY.some((t) => t.toolId === toolId);
}
