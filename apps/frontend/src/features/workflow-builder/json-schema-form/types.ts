/**
 * Minimal JSON Schema shape consumed by the form renderer.
 *
 * The renderer walks the JSON Schema produced by Zod 4's
 * `z.toJSONSchema()` and emits Mantine widgets. Only the subset of JSON
 * Schema actually used by activity parameter schemas is typed here —
 * extend as we use more features.
 *
 * UI hints ride through as `x-*` extension fields (set via Zod's
 * `.meta({ ... })`):
 *   - x-widget: "combobox" | "textarea" | "documentPicker" | ...
 *   - x-options: string[] | number[]
 *   - x-default: unknown
 *   - x-step: number   (for numeric inputs)
 */

export interface JsonSchemaProperty {
  type?: "string" | "number" | "integer" | "boolean" | "object" | "array";
  title?: string;
  description?: string;
  enum?: ReadonlyArray<string | number>;
  minimum?: number;
  maximum?: number;
  examples?: ReadonlyArray<unknown>;
  default?: unknown;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  items?: JsonSchemaProperty;
  /** Hints */
  "x-widget"?: string;
  "x-options"?: ReadonlyArray<string | number>;
  "x-default"?: unknown;
  "x-step"?: number;
}

export interface JsonSchemaObject extends JsonSchemaProperty {
  type: "object";
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
}

export function isObjectSchema(
  schema: JsonSchemaProperty | undefined,
): schema is JsonSchemaObject {
  return !!schema && schema.type === "object" && !!schema.properties;
}
