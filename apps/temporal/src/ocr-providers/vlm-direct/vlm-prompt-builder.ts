/**
 * Build the messages + JSON Schema for an Azure OpenAI chat-completions
 * VLM-direct extraction call.
 *
 * Plays the same role as
 * `azure-content-understanding/analyzer-schema-builder.ts`, but instead of
 * producing a CU analyzer body, it produces:
 *
 *   - A `system` message with the global instruction text (from the
 *     iteration kit's `prompt.md`).
 *   - A `user` message with a short directive plus the image attachment.
 *   - A JSON Schema (strict mode) that pins the response to
 *     `{ fields, source_quotes }` with one entry per field_key.
 *
 * Field-type vocabulary mapping (canonical `FieldType` → JSON Schema):
 *
 *   string         → { "type": "string" }
 *   number         → { "type": ["number", "null"] }       (always nullable —
 *                                                         distinguishes
 *                                                         blank vs. zero)
 *   date           → { "type": "string" }                 (ISO date string;
 *                                                         "" if blank)
 *   selectionMark  → { "type": "string",
 *                       "enum": ["selected", "unselected"] }
 *   signature      → { "type": "string" }
 *
 * OpenAI strict mode requires:
 *   - every property to appear in the parent's `required` array,
 *   - `additionalProperties: false` on every object,
 *   - no `format` keywords (date is a plain string here).
 *
 * Per-field descriptions feed the field's JSON Schema `description`. The
 * model treats them as natural-language guidance.
 */

export type TemplateFieldType =
  | "string"
  | "number"
  | "date"
  | "selectionMark"
  | "signature";

export interface VlmTemplateFieldDefinition {
  field_key: string;
  field_type: TemplateFieldType;
  field_format?: string | null;
}

const NULLABLE_NUMERIC_HINT =
  " If the cell is completely blank (no number written), return null. Only return the number 0 if the cell explicitly shows a literal 0 / $0.";

/** OpenAI JSON Schema fragment (subset we actually emit). */
export type VlmJsonSchemaProperty =
  | {
      type: "string";
      description?: string;
      enum?: string[];
    }
  | {
      type: ["number", "null"];
      description?: string;
    }
  | {
      type: ["string", "null"];
      description?: string;
    };

export interface VlmJsonSchema {
  type: "object";
  properties: Record<string, VlmJsonSchemaProperty>;
  required: string[];
  additionalProperties: false;
}

export interface VlmResponseFormatSchema {
  /** OpenAI requires a name; surfaced in errors. */
  name: string;
  /** Strict mode is required for E04 to avoid free-form output. */
  strict: true;
  schema: {
    type: "object";
    properties: {
      fields: VlmJsonSchema;
      source_quotes: VlmJsonSchema;
    };
    required: ["fields", "source_quotes"];
    additionalProperties: false;
  };
}

export interface BuildVlmRequestOptions {
  /** Field definitions (keyed by `field_key`, ordered by `display_order`). */
  fields: VlmTemplateFieldDefinition[];
  /** Per-field description overlay; missing entries get no description. */
  descriptions?: Record<string, string>;
  /** Global instruction; sent as the system message. */
  documentAnnotationPrompt?: string;
  /**
   * When true (default), every numeric field's description carries an
   * explicit blank-vs-zero instruction so the model emits null on blank
   * cells. Set false to follow the original description verbatim.
   */
  numericFieldsNullable?: boolean;
  /**
   * JSON Schema name surfaced to OpenAI (must match `[a-zA-Z0-9_-]{1,64}`).
   * Defaults to `sdpr_vlm_extraction`.
   */
  schemaName?: string;
}

const DEFAULT_SCHEMA_NAME = "sdpr_vlm_extraction";

const DEFAULT_SYSTEM_PROMPT = `You are a document-extraction assistant. Read the form image carefully and emit JSON conforming to the supplied schema. Be conservative: do not guess values that are not visibly present on the form.`;

const USER_DIRECTIVE = `Extract the form's structured fields. For every field also emit a short verbatim source_quote (the exact text or label you used as evidence). If you cannot locate a field on the form, return the schema-appropriate empty value (null for numbers, "" for strings) and an empty source_quote.`;

/**
 * Map one canonical field-type row to its JSON-Schema property fragment.
 * `descriptions[field_key]` (when non-empty) becomes the property's
 * `description`. Numeric-nullable hint is appended when configured.
 */
function fieldDefinitionToProperty(
  field: VlmTemplateFieldDefinition,
  description: string | undefined,
  numericFieldsNullable: boolean,
): VlmJsonSchemaProperty {
  const trimmed = description?.trim();
  switch (field.field_type) {
    case "number": {
      const desc = numericFieldsNullable
        ? `${trimmed ?? ""}${NULLABLE_NUMERIC_HINT}`.trim()
        : trimmed;
      return desc
        ? { type: ["number", "null"], description: desc }
        : { type: ["number", "null"] };
    }
    case "selectionMark": {
      const base: VlmJsonSchemaProperty = {
        type: "string",
        enum: ["selected", "unselected"],
      };
      return trimmed ? { ...base, description: trimmed } : base;
    }
    case "string":
    case "signature":
    case "date": {
      return trimmed
        ? { type: "string", description: trimmed }
        : { type: "string" };
    }
  }
}

export interface VlmExtractionRequest {
  /** System message — the global instruction prompt. */
  systemPrompt: string;
  /** User-message text (preceding the image attachment). */
  userPrompt: string;
  /** Strict-mode JSON Schema for the chat-completions response_format. */
  responseFormat: VlmResponseFormatSchema;
  /** Ordered list of field keys present in the schema. */
  fieldKeys: string[];
}

/**
 * Build the chat-completions request shape (messages + response_format) for
 * a VLM-direct extraction call. Returns null when no fields are defined.
 */
export function buildVlmExtractionRequest(
  options: BuildVlmRequestOptions,
): VlmExtractionRequest | null {
  const fields = options.fields ?? [];
  if (fields.length === 0) return null;
  const descriptions = options.descriptions ?? {};
  const numericFieldsNullable = options.numericFieldsNullable ?? true;

  const fieldProperties: Record<string, VlmJsonSchemaProperty> = {};
  const sourceQuoteProperties: Record<string, VlmJsonSchemaProperty> = {};
  const fieldKeys: string[] = [];

  for (const f of fields) {
    const key = f.field_key.trim();
    if (!key) continue;
    if (fieldProperties[key] !== undefined) continue;
    fieldProperties[key] = fieldDefinitionToProperty(
      f,
      descriptions[key],
      numericFieldsNullable,
    );
    sourceQuoteProperties[key] = {
      type: "string",
      description: `Verbatim quote from the form supporting the value chosen for ${key}. Empty string if the field is not present on this form.`,
    };
    fieldKeys.push(key);
  }

  if (fieldKeys.length === 0) return null;

  const responseFormat: VlmResponseFormatSchema = {
    name: options.schemaName ?? DEFAULT_SCHEMA_NAME,
    strict: true,
    schema: {
      type: "object",
      properties: {
        fields: {
          type: "object",
          properties: fieldProperties,
          required: [...fieldKeys],
          additionalProperties: false,
        },
        source_quotes: {
          type: "object",
          properties: sourceQuoteProperties,
          required: [...fieldKeys],
          additionalProperties: false,
        },
      },
      required: ["fields", "source_quotes"],
      additionalProperties: false,
    },
  };

  const systemPromptText = options.documentAnnotationPrompt?.trim();
  const systemPrompt =
    systemPromptText && systemPromptText.length > 0
      ? `${DEFAULT_SYSTEM_PROMPT}\n\n${systemPromptText}`
      : DEFAULT_SYSTEM_PROMPT;

  return {
    systemPrompt,
    userPrompt: USER_DIRECTIVE,
    responseFormat,
    fieldKeys,
  };
}

/** Cheap deterministic hash for change detection. */
export function hashVlmExtractionRequest(req: VlmExtractionRequest): string {
  const s = JSON.stringify({
    systemPrompt: req.systemPrompt,
    userPrompt: req.userPrompt,
    responseFormat: req.responseFormat,
  });
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
