/**
 * `source.api` — push-pattern source catalog entry (US-115).
 *
 * Programmatic intake: callers POST a JSON body matching the
 * user-authored `fields[]` shape to
 * `/api/workflows/:id/runs`. Each `FieldDescriptor` becomes a
 * top-level ctx key after the runtime's body-validation step
 * (see DOCUMENT_SOURCES_DESIGN.md §3.1).
 *
 * `deriveOutputSchema` is pure — given a configured `fields[]` it
 * returns the corresponding JSON Schema 7 object that
 * `/run-spec` (US-111) and `/runs` body validation consume.
 *
 * The Zod `parametersSchema` is the single source of truth for
 * save-time validation; the frontend `FieldListEditor` x-widget
 * (US-120) consumes the `.meta({ "x-widget": "field-list-editor" })`
 * tag to render the rich field list.
 */

import { z } from "zod/v4";

import type {
  FieldDescriptor,
  JsonSchema7,
  SourceCatalogEntry,
} from "../source-types";

/**
 * URL-safe identifier regex per the story acceptance criteria.
 * Matches the JavaScript identifier shape (leading letter or `_`,
 * followed by letters/digits/underscores). Intentionally
 * permissive — reserved-word checks are out of scope.
 */
const FIELD_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const fieldTypeEnum = z.enum([
  "string",
  "number",
  "boolean",
  "object",
  "array",
]);

/**
 * Permissive Zod type for the optional `kind` annotation on a
 * `FieldDescriptor`. `KindRef` is a string-literal union; the
 * binding-walk validator (Phase 3) narrows against the live
 * `ARTIFACT_REGISTRY` at save time, so the Zod layer accepts any
 * string and lets the downstream validator surface registry
 * mismatches with their canonical error message.
 */
const kindRefSchema = z.string().optional();

const fieldDescriptorSchema = z.object({
  name: z
    .string()
    .regex(FIELD_NAME_REGEX, {
      message:
        "Field name must match /^[a-zA-Z_][a-zA-Z0-9_]*$/ (URL-safe identifier)",
    }),
  type: fieldTypeEnum,
  kind: kindRefSchema,
  required: z.boolean(),
  description: z.string().optional(),
  defaultValue: z.unknown().optional(),
});

/**
 * Static parameters for a `source.api` node. The `fields[]`
 * default is the empty array so `parametersSchema.parse({})`
 * succeeds — a freshly-dropped node with no configured fields is
 * still structurally valid; runtime callers will simply see an
 * empty input schema.
 */
export const sourceApiParametersSchema = z
  .object({
    fields: z
      .array(fieldDescriptorSchema)
      .default([])
      .meta({
        title: "Fields",
        description:
          "API input fields callers must send in the POST body. Each field becomes a top-level ctx key after validation.",
        "x-widget": "field-list-editor",
      }),
    authNotes: z
      .string()
      .optional()
      .meta({
        title: "Auth notes",
        description:
          "Optional override of the default auth-notes string shown in the Run drawer.",
      }),
  })
  .refine(
    (params) => {
      const names = params.fields.map((f) => f.name);
      return new Set(names).size === names.length;
    },
    { message: "Field names must be unique within source.api" },
  );

/**
 * Map a `FieldDescriptor.type` to its JSON Schema 7 primitive
 * type string. All five values are valid JSON Schema 7 primitive
 * types, so this is a straight pass-through — kept as a separate
 * helper so the contract is documented in one place.
 */
function jsonSchemaTypeFor(fieldType: FieldDescriptor["type"]): string {
  return fieldType;
}

/**
 * Pure derivation of the source's output JSON Schema from its
 * configured parameters. Throws if `parameters` doesn't shape-match
 * `sourceApiParametersSchema` — callers are expected to have run
 * `createSourceParameterValidator` upstream.
 */
function deriveOutputSchema(
  parameters: Record<string, unknown>,
): JsonSchema7 {
  const parsed = sourceApiParametersSchema.parse(parameters);
  const properties: Record<string, JsonSchema7> = {};
  const required: string[] = [];
  for (const field of parsed.fields) {
    const propSchema: JsonSchema7 = { type: jsonSchemaTypeFor(field.type) };
    if (field.description !== undefined) {
      propSchema.description = field.description;
    }
    if (field.defaultValue !== undefined) {
      propSchema.default = field.defaultValue;
    }
    properties[field.name] = propSchema;
    if (field.required) required.push(field.name);
  }
  return { type: "object", properties, required };
}

export const sourceApiCatalogEntry: SourceCatalogEntry = {
  type: "source.api",
  category: "source",
  displayName: "API endpoint",
  description:
    "Programmatic intake — callers POST JSON matching the declared field shape to /api/workflows/:id/runs.",
  iconHint: "cloud-upload",
  colorHint: "indigo",
  parametersSchema: sourceApiParametersSchema,
  runtime: "push",
  deriveOutputSchema,
  outputKind: "Artifact",
};
