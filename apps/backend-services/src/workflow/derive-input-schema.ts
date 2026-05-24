import {
  getSourceCatalogEntry as defaultGetSourceCatalogEntry,
  type JsonSchema7,
  type SourceCatalogEntry,
} from "@ai-di/graph-workflow";
import type {
  CtxDeclaration,
  GraphWorkflowConfig,
  LibraryPortDescriptor,
  SourceNode,
} from "./graph-workflow-types";

/**
 * Minimal JSON Schema 7 object subset used by the run-spec endpoint.
 *
 * We deliberately keep this narrow: Track 2 enforces presence + primitive
 * `type` for caller-supplied inputs, nothing more. Deep validation
 * (e.g. nested `properties` / `items` for object/array types) is filed
 * for Phase 3 (typed I/O).
 */
export type InputJsonSchemaProperty =
  | { type: "string"; title?: string; description?: string; default?: unknown }
  | { type: "number"; title?: string; description?: string; default?: unknown }
  | { type: "boolean"; title?: string; description?: string; default?: unknown }
  | { type: "object"; title?: string; description?: string; default?: unknown }
  | { type: "array"; title?: string; description?: string; default?: unknown };

export interface InputJsonSchema {
  type: "object";
  properties: Record<string, InputJsonSchemaProperty>;
  required: string[];
}

/**
 * Optional injection seam used by tests and by the Phase 8 source-aware
 * derivation path. Mirrors the shape used by
 * `ValidateGraphConfigOptions.getSourceCatalogEntry` in the shared
 * `@ai-di/graph-workflow` validator so the helper can be exercised
 * against synthetic source catalog entries until US-115 + US-116 land
 * the real `source.api` / `source.upload` entries.
 */
export interface DeriveInputSchemaOptions {
  getSourceCatalogEntry?: (
    sourceType: string,
  ) => SourceCatalogEntry | undefined;
}

/**
 * Derive a JSON Schema describing a workflow's expected input payload.
 *
 * Precedence (Phase 8, DOCUMENT_SOURCES_DESIGN.md §4.1):
 *   1. `source.api` node → derive from the source catalog entry's
 *      `deriveOutputSchema(parameters)`. Wins over every other source.
 *   2. Library workflows (`metadata.kind === "library"`) → derived from
 *      `metadata.inputs[]` (unchanged from Phase 2 Track 1).
 *   3. Regular workflows → derived from `ctx[]` entries flagged
 *      `isInput: true` (unchanged from Phase 2 Track 2).
 *   4. None of the above → empty-object schema.
 *
 * The function is pure (no I/O, no NestJS dependencies) and exhaustively
 * unit-tested in `derive-input-schema.spec.ts`.
 */
export function deriveInputSchema(
  config: GraphWorkflowConfig,
  options: DeriveInputSchemaOptions = {},
): InputJsonSchema {
  const sourceApiNode = findSourceApiNode(config);
  if (sourceApiNode) {
    return deriveFromSourceApi(sourceApiNode, options);
  }

  if (config.metadata?.kind === "library") {
    return deriveFromLibraryInputs(config.metadata.inputs ?? []);
  }

  return deriveFromCtx(config.ctx ?? {});
}

/**
 * Inline filter (per US-111 note: do NOT extract a helper for "find
 * source.api in config" — keep it readable at the single call site).
 * `config.nodes` is a `Record`, so `Object.values()` gives a typed
 * `GraphNode[]`.
 */
function findSourceApiNode(
  config: GraphWorkflowConfig,
): SourceNode | undefined {
  for (const node of Object.values(config.nodes)) {
    if (node.type === "source" && node.sourceType === "source.api") {
      return node;
    }
  }
  return undefined;
}

function deriveFromSourceApi(
  sourceNode: SourceNode,
  options: DeriveInputSchemaOptions,
): InputJsonSchema {
  const lookup = options.getSourceCatalogEntry ?? defaultGetSourceCatalogEntry;
  const entry = lookup(sourceNode.sourceType);
  if (!entry) {
    throw new Error(
      `Unknown source type \`${sourceNode.sourceType}\` for node \`${sourceNode.id}\``,
    );
  }
  const output = entry.deriveOutputSchema(sourceNode.parameters ?? {});
  return adaptJsonSchemaToInputSchema(output);
}

/**
 * Adapt the broader `JsonSchema7` open-shape returned by source catalog
 * `deriveOutputSchema` callbacks to the stricter `InputJsonSchema`
 * shape consumed by the `/run-spec` endpoint and `validateRunInput`.
 *
 * The source catalog's JSON Schema is allowed to carry arbitrary
 * extension keys (it's open-shape); the run-spec endpoint only consumes
 * `type` / `properties` / `required`. This adapter narrows the property
 * types to the five primitives the endpoint supports and drops any
 * extension keys we don't recognise.
 *
 * If a property's `type` is not one of the supported primitives the
 * property is dropped (defensive — source.api's `parametersSchema`
 * already restricts field types to the five primitives, so this
 * branch is unreachable in production but keeps the adapter total).
 */
function adaptJsonSchemaToInputSchema(schema: JsonSchema7): InputJsonSchema {
  const properties: Record<string, InputJsonSchemaProperty> = {};
  const sourceProperties = schema.properties ?? {};

  for (const [key, raw] of Object.entries(sourceProperties)) {
    const property = adaptProperty(raw);
    if (property) properties[key] = property;
  }

  return {
    type: "object",
    properties,
    required: schema.required ?? [],
  };
}

function adaptProperty(raw: JsonSchema7): InputJsonSchemaProperty | undefined {
  const type = raw.type;
  if (
    type !== "string" &&
    type !== "number" &&
    type !== "boolean" &&
    type !== "object" &&
    type !== "array"
  ) {
    return undefined;
  }

  const property: InputJsonSchemaProperty = { type };
  if (typeof raw.title === "string") property.title = raw.title;
  if (typeof raw.description === "string") {
    property.description = raw.description;
  }
  if (raw.default !== undefined) property.default = raw.default;
  return property;
}

function deriveFromLibraryInputs(
  inputs: LibraryPortDescriptor[],
): InputJsonSchema {
  const properties: Record<string, InputJsonSchemaProperty> = {};
  const required: string[] = [];

  for (const input of inputs) {
    properties[input.path] = { type: input.type, title: input.label };
    required.push(input.path);
  }

  return { type: "object", properties, required };
}

function deriveFromCtx(ctx: Record<string, CtxDeclaration>): InputJsonSchema {
  const properties: Record<string, InputJsonSchemaProperty> = {};
  const required: string[] = [];

  for (const [key, declaration] of Object.entries(ctx)) {
    if (declaration.isInput !== true) continue;

    const property: InputJsonSchemaProperty = { type: declaration.type };
    if (declaration.description) property.description = declaration.description;
    if (declaration.defaultValue !== undefined) {
      property.default = declaration.defaultValue;
    } else {
      required.push(key);
    }

    properties[key] = property;
  }

  return { type: "object", properties, required };
}
