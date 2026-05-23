import type {
  CtxDeclaration,
  GraphWorkflowConfig,
  LibraryPortDescriptor,
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
 * Derive a JSON Schema describing a workflow's expected input payload.
 *
 * - **Library workflows** (`metadata.kind === "library"`) source inputs
 *   from `metadata.inputs[]` (the declared library signature). Library
 *   inputs have no notion of `defaultValue`, so every input is required.
 * - **Regular workflows** source inputs from `ctx[]` entries flagged
 *   `isInput: true`. An entry with `defaultValue` set is optional;
 *   otherwise it is required.
 *
 * The function is pure (no I/O, no NestJS dependencies) and exhaustively
 * unit-tested in `derive-input-schema.spec.ts`.
 */
export function deriveInputSchema(
  config: GraphWorkflowConfig,
): InputJsonSchema {
  if (config.metadata?.kind === "library") {
    return deriveFromLibraryInputs(config.metadata.inputs ?? []);
  }
  return deriveFromCtx(config.ctx ?? {});
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
