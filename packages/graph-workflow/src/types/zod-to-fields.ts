/**
 * Zod → FieldDescriptor[] converter for kind field schemas
 * (KIND_FIELD_SCHEMAS_DESIGN.md §3.4).
 *
 * A kind's shape is authored ONCE as a Zod schema; activities derive their
 * I/O type via `z.infer`, and the registry derives its `fields` here. Nested
 * kind references are recovered by SCHEMA IDENTITY: a sub-schema that is (===)
 * a schema registered in `kindSchemas` becomes `{ type, kind }` — a reference,
 * not an inline copy. An anonymous nested object stays `{ type: "object" }`
 * with no kind, where picker drill-down stops (spec open question 5).
 *
 * Deliberately narrow: accepts string/number/boolean/literal/enum/object/
 * array/optional and THROWS on anything else (union, record, transform, …)
 * so an unsupported construct fails loudly at module load instead of
 * deriving a schema that lies to the picker.
 */
import type { ZodType } from "zod/v4";
import type { FieldDescriptor } from "../catalog/source-types";
import type { ArrayKind, KindRef } from "./artifacts";

/** Identity map from a kind's Zod schema object to its kind name. */
export type KindSchemaMap = ReadonlyMap<ZodType, KindRef>;

/** The zod/v4 public def surface this converter relies on. */
interface ZodDefView {
  type: string;
  innerType?: ZodType;
  element?: ZodType;
  values?: unknown[];
}

function defOf(schema: ZodType): ZodDefView {
  return (schema as unknown as { def: ZodDefView }).def;
}

export function zodToFields(
  schema: ZodType,
  kindSchemas: KindSchemaMap,
): FieldDescriptor[] {
  const def = defOf(schema);
  if (def.type !== "object") {
    throw new Error(
      `zodToFields: top-level schema must be an object, got "${def.type}"`,
    );
  }
  const shape = (schema as unknown as { shape: Record<string, ZodType> }).shape;
  return Object.entries(shape).map(([name, fieldSchema]) =>
    fieldToDescriptor(name, fieldSchema, kindSchemas),
  );
}

function fieldToDescriptor(
  name: string,
  fieldSchema: ZodType,
  kindSchemas: KindSchemaMap,
): FieldDescriptor {
  let required = true;
  let current = fieldSchema;
  while (defOf(current).type === "optional") {
    const inner = defOf(current).innerType;
    if (inner === undefined) break;
    required = false;
    current = inner;
  }
  const def = defOf(current);
  switch (def.type) {
    case "string":
    case "number":
    case "boolean":
      return { name, type: def.type, required };
    case "literal": {
      const literalType = typeof def.values?.[0];
      if (
        literalType !== "string" &&
        literalType !== "number" &&
        literalType !== "boolean"
      ) {
        throw new Error(
          `zodToFields: unsupported literal type "${literalType}" for field "${name}"`,
        );
      }
      return { name, type: literalType, required };
    }
    case "enum":
      // zod/v4 enums are string-valued (def.entries is a name→value record);
      // the picker only needs the primitive category, not the member list.
      return { name, type: "string", required };
    case "object": {
      const kind = kindSchemas.get(current);
      return kind !== undefined
        ? { name, type: "object", kind, required }
        : { name, type: "object", required };
    }
    case "array": {
      const elementKind = def.element
        ? kindSchemas.get(def.element)
        : undefined;
      return elementKind !== undefined
        ? {
            name,
            type: "array",
            kind: `${elementKind}[]` as ArrayKind,
            required,
          }
        : { name, type: "array", required };
    }
    default:
      throw new Error(
        `zodToFields: unsupported schema type "${def.type}" for field "${name}"`,
      );
  }
}
