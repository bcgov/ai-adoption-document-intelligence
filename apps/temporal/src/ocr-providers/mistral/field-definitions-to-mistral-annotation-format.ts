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
      properties: Record<
        string,
        { type: string; title?: string; enum?: string[] }
      >;
      required: string[];
      additionalProperties: false;
    };
  };
}

function jsonSchemaPropertyForField(field: TemplateFieldDefinitionInput): {
  type: string;
  title?: string;
  enum?: string[];
} {
  const title = field.field_key;
  switch (field.field_type) {
    case "number":
      return { type: "number", title };
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
}

/**
 * Builds `document_annotation_format` for POST /v1/ocr from ordered field definitions.
 * Empty array returns null (caller should skip annotation on the request).
 */
export function fieldDefinitionsToMistralDocumentAnnotationFormat(
  fields: TemplateFieldDefinitionInput[],
): MistralDocumentAnnotationFormat | null {
  if (!fields.length) {
    return null;
  }

  const properties: Record<
    string,
    { type: string; title?: string; enum?: string[] }
  > = {};
  const required: string[] = [];

  for (const f of fields) {
    const key = f.field_key.trim();
    if (!key) {
      continue;
    }
    properties[key] = jsonSchemaPropertyForField(f);
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
