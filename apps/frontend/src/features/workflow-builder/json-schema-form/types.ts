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
 *   - x-options-labels: Record<string, string>  (label per literal/enum value)
 *   - x-default: unknown
 *   - x-step: number   (for numeric inputs)
 *
 * Discriminated unions emerge as a root-level `anyOf` whose variants are
 * each an object containing a shared string property with a literal `const`
 * value (the discriminator). The renderer detects this shape and shows a
 * Select for the discriminator + the matching variant's remaining fields.
 */

export interface JsonSchemaProperty {
  type?: "string" | "number" | "integer" | "boolean" | "object" | "array";
  title?: string;
  description?: string;
  enum?: ReadonlyArray<string | number>;
  const?: string | number | boolean;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  examples?: ReadonlyArray<unknown>;
  default?: unknown;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean | JsonSchemaProperty;
  items?: JsonSchemaProperty;
  anyOf?: JsonSchemaProperty[];
  oneOf?: JsonSchemaProperty[];
  /** Hints */
  "x-widget"?: string;
  "x-options"?: ReadonlyArray<string | number>;
  "x-options-labels"?: Record<string, string>;
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

/**
 * A discriminated union over object variants — emitted by Zod v4's
 * `z.discriminatedUnion()` as a root `anyOf` whose variants each have a
 * single shared `type: "string", const: "..."` property.
 *
 * Returns the discriminator info if the shape matches, otherwise null.
 */
export interface DiscriminatedUnion {
  discriminator: string;
  variants: Array<{
    literal: string;
    schema: JsonSchemaObject;
    label?: string;
  }>;
}

export function detectDiscriminatedUnion(
  schema: JsonSchemaProperty | undefined,
): DiscriminatedUnion | null {
  if (!schema || !Array.isArray(schema.anyOf) || schema.anyOf.length === 0) {
    return null;
  }

  const objectVariants: JsonSchemaObject[] = [];
  for (const variant of schema.anyOf) {
    if (!isObjectSchema(variant)) return null;
    objectVariants.push(variant);
  }

  // Pick the first object property that, in every variant, is a string with a
  // `const` value. That's the discriminator.
  const firstProps = Object.keys(objectVariants[0].properties);
  let discriminator: string | null = null;
  for (const propName of firstProps) {
    const allHaveConst = objectVariants.every((v) => {
      const p = v.properties[propName];
      return !!p && p.type === "string" && typeof p.const === "string";
    });
    if (allHaveConst) {
      discriminator = propName;
      break;
    }
  }
  if (!discriminator) return null;

  const variants = objectVariants.map((v) => {
    const literal = String(v.properties[discriminator!].const);
    const labels = v.properties[discriminator!]["x-options-labels"];
    return {
      literal,
      schema: v,
      label: labels?.[literal],
    };
  });

  return { discriminator, variants };
}
