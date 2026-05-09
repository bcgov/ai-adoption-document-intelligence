/**
 * Maps TemplateModel field definitions (labeling schema) to Mistral OCR
 * `document_annotation_format` (JSON Schema wrapper).
 * @see https://docs.mistral.ai/capabilities/document_ai/annotations/
 */

/** Aligns with Prisma FieldType enum values. */
export type TemplateFieldType =
  | "string"
  | "number"
  | "date"
  | "selectionMark"
  | "signature";

export interface TemplateFieldDefinitionInput {
  field_key: string;
  field_type: TemplateFieldType;
  field_format?: string | null;
}

type JsonSchemaProperty = {
  type: string | string[];
  title?: string;
  description?: string;
  enum?: string[];
};

/** Mistral request body fragment for document-level structured extraction. */
export interface MistralDocumentAnnotationFormat {
  type: "json_schema";
  json_schema: {
    name: string;
    /**
     * Required by the Foundry deployment for the annotation step to actually
     * run. Without `strict: true` at the `json_schema` wrapper level, Foundry
     * accepts the request, returns OCR markdown, but silently skips
     * annotation (`pages_processed_annotation: 0`, `document_annotation: null`).
     * @see https://learn.microsoft.com/en-au/answers/questions/5767943/
     */
    strict: true;
    schema: {
      type: "object";
      title: string;
      properties: Record<string, JsonSchemaProperty>;
      required: string[];
      additionalProperties: false;
    };
  };
}

export interface FieldDefinitionsToMistralOptions {
  /**
   * Optional per-field description overlay, keyed by `field_key`. When set
   * (and non-empty), the description is added to the JSON Schema property —
   * this is the canonical way to disambiguate fields beyond the field_key
   * itself, and improves Mistral's extraction accuracy on ambiguous forms.
   * Missing or empty entries are skipped (no `description` emitted).
   */
  descriptions?: Record<string, string>;
  /**
   * When true, every numeric field becomes a JSON Schema union of
   * `["number", "null"]`. Lets Mistral return `null` for cells that are
   * blank (no value written), distinct from cells that explicitly show
   * `0`/`$0`. Without this, the schema forces a number even for blanks
   * and the blank-vs-zero distinction is lost. Strict mode supports the
   * union (verified against the Foundry deployment).
   */
  numericFieldsNullable?: boolean;
}

function jsonSchemaPropertyForField(
  field: TemplateFieldDefinitionInput,
  description: string | undefined,
  numericFieldsNullable: boolean,
): JsonSchemaProperty {
  const title = field.field_key;
  const trimmedDesc = description?.trim();
  const base: JsonSchemaProperty = (() => {
    switch (field.field_type) {
      case "number":
        return {
          type: numericFieldsNullable ? ["number", "null"] : "number",
          title,
        };
      case "string":
      case "date":
      case "signature":
        return { type: "string", title };
      case "selectionMark":
        return {
          type: "string",
          title,
          enum: ["selected", "unselected"],
        };
    }
  })();
  return trimmedDesc ? { ...base, description: trimmedDesc } : base;
}

/**
 * Builds `document_annotation_format` for POST /v1/ocr from ordered field definitions.
 * Empty array returns null (caller should skip annotation on the request).
 *
 * Pass `options.descriptions` to attach per-field `description` strings to
 * the emitted JSON Schema; entries are matched by `field_key`.
 */
export function fieldDefinitionsToMistralDocumentAnnotationFormat(
  fields: TemplateFieldDefinitionInput[],
  options?: FieldDefinitionsToMistralOptions,
): MistralDocumentAnnotationFormat | null {
  if (!fields.length) {
    return null;
  }

  const properties: Record<string, JsonSchemaProperty> = {};
  const required: string[] = [];
  const descriptions = options?.descriptions ?? {};
  const numericFieldsNullable = options?.numericFieldsNullable ?? false;

  for (const f of fields) {
    const key = f.field_key.trim();
    if (!key) {
      continue;
    }
    properties[key] = jsonSchemaPropertyForField(
      f,
      descriptions[key],
      numericFieldsNullable,
    );
    required.push(key);
  }

  if (required.length === 0) {
    return null;
  }

  return {
    type: "json_schema",
    json_schema: {
      name: "document_annotation",
      strict: true,
      schema: {
        type: "object",
        title: "DocumentAnnotation",
        properties,
        required,
        additionalProperties: false,
      },
    },
  };
}
