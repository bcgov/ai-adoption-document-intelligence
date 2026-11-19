/**
 * Pure helper backing the "Change activity type" canvas action (US-047).
 *
 * Given an existing `ActivityNode` and a target activity type, computes
 * the swapped node:
 *   - `activityType` becomes the new type.
 *   - `parameters` are the intersection of the old parameters and the new
 *     schema's properties — keys present in both are preserved, keys not
 *     present in the new schema are dropped. Keys required by the new
 *     schema but missing from the source get a sensible default
 *     (matches `JsonSchemaForm.defaultValueForSchema()`'s rules: first
 *     enum value, empty string, `false`, schema minimum, or 1).
 *   - `inputs` / `outputs` keep only the bindings whose PORT the new type
 *     declares — the same intersection rule the parameters already follow
 *     (G-032). Carrying them verbatim was silent data corruption: the engine
 *     writes `result[binding.port]` for every persisted output row, and
 *     `writeToCtx` has no undefined guard (`current[finalKey] = value`), so a
 *     stale row overwrote the ctx key downstream consumers read — with the
 *     canvas still drawing the wire, because the wire index reads
 *     `node.outputs` and only decorates from the catalog.
 *   - lock metadata is pruned to the surviving ports for the same reason.
 *   - all other fields (`id`, `label`, `errorPolicy`, `retry`, `timeout`) are
 *     carried over verbatim.
 *
 * Dropped bindings are RETURNED, not swallowed: the caller names them, the way
 * the delete paths name orphaned ctx keys. Pruning silently would trade one
 * invisible failure for another.
 *
 * The helper drives off the new type's JSON Schema (`z.toJSONSchema()`),
 * which makes it framework-agnostic and matches what the form renderer
 * already walks. If the target type isn't in the supplied catalog the
 * helper throws — callers should validate the picker selection first.
 *
 * The catalog argument defaults to the shared `ACTIVITY_CATALOG`; tests
 * may pass a custom catalog so assertions don't depend on the real
 * catalog's evolving shape.
 */

import {
  ACTIVITY_CATALOG,
  type ActivityCatalogEntry,
} from "@ai-di/graph-workflow";
import { z } from "zod/v4";
import type { ActivityNode } from "../../../types/workflow";
import type {
  JsonSchemaObject,
  JsonSchemaProperty,
} from "../json-schema-form/types";
import { isObjectSchema } from "../json-schema-form/types";

/** A port binding the swap dropped because the new type does not declare it. */
export interface DroppedBinding {
  direction: "input" | "output";
  port: string;
  ctxKey: string;
}

export interface SwapResult {
  node: ActivityNode;
  /** Bindings the new type cannot honour, in input-then-output order. */
  dropped: DroppedBinding[];
}

/**
 * Returns a sensible default value for a JSON Schema property, mirroring
 * `JsonSchemaForm.defaultValueForSchema()`. Used to seed required new
 * fields when the source node didn't carry that key.
 *
 * Returns `undefined` when no reasonable default is available — the
 * caller drops the key in that case and lets the Zod validator surface
 * the missing-required error in the validation drawer (Scenario 4).
 */
function defaultValueForJsonSchema(schema: JsonSchemaProperty): unknown {
  if (schema["x-default"] !== undefined) return schema["x-default"];
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0];
  }
  if (schema.type === "integer" || schema.type === "number") {
    return schema.minimum ?? 1;
  }
  if (schema.type === "string") return "";
  if (schema.type === "boolean") return false;
  return undefined;
}

/**
 * Narrows an unknown JSON Schema fragment to the object-with-properties
 * shape the swap helper walks.
 */
function asObjectSchema(schema: unknown): JsonSchemaObject | undefined {
  if (typeof schema !== "object" || schema === null) return undefined;
  const candidate = schema as JsonSchemaProperty;
  return isObjectSchema(candidate) ? candidate : undefined;
}

/**
 * Walks the target activity's parameter schema and produces the swap's
 * new `parameters` map. Treats Zod discriminated unions (root-level
 * `anyOf`) by taking the first variant's defaults so the resulting
 * object at least has a valid discriminator and the rest of its required
 * fields seeded — the user can switch variants in the settings panel
 * afterwards.
 */
function buildSwappedParameters(
  entry: ActivityCatalogEntry,
  oldParameters: Record<string, unknown>,
): Record<string, unknown> {
  // `z.toJSONSchema()` is the same conversion the runtime catalog uses
  // (`getActivityParametersJsonSchema`); going through the entry's Zod
  // schema directly removes a global-catalog dependency so test fixtures
  // can pass their own catalog without registering it globally.
  // Phase 6 dynamic-node entries carry `paramsSchema` (JSON Schema 7) directly
  // and omit the Zod `parametersSchema`; in that case we read the JSON Schema
  // as-is rather than converting from Zod.
  let rawSchema: unknown;
  if (entry.paramsSchema) {
    rawSchema = entry.paramsSchema;
  } else if (entry.parametersSchema) {
    rawSchema = z.toJSONSchema(entry.parametersSchema);
  } else {
    return {};
  }
  const root = rawSchema as JsonSchemaProperty;
  let target: JsonSchemaObject | undefined = asObjectSchema(root);
  if (!target && Array.isArray(root.anyOf) && root.anyOf.length > 0) {
    target = asObjectSchema(root.anyOf[0]);
  }
  if (!target) return {};

  const required = new Set(target.required ?? []);
  const newParameters: Record<string, unknown> = {};
  for (const [key, propSchema] of Object.entries(target.properties)) {
    if (key in oldParameters) {
      newParameters[key] = oldParameters[key];
      continue;
    }
    // Always seed `const`-valued fields (the discriminator literal of a
    // chosen union variant) so the workflow stays Zod-parseable on the
    // discriminator field even if the user never opens the settings
    // panel.
    if (propSchema.const !== undefined) {
      newParameters[key] = propSchema.const;
      continue;
    }
    if (!required.has(key)) {
      continue;
    }
    const defaultValue = defaultValueForJsonSchema(propSchema);
    if (defaultValue !== undefined) {
      newParameters[key] = defaultValue;
    }
  }
  return newParameters;
}

/**
 * Compute the swapped activity node. All non-parameter fields are
 * carried over from the original node verbatim.
 *
 * @param node The original activity node.
 * @param newActivityType The catalog activityType to swap to.
 * @param catalog Activity catalog (defaults to the shared
 *                `ACTIVITY_CATALOG`). Test fixtures may pass a custom
 *                catalog to isolate from the live catalog's evolution.
 */
export function swapActivityType(
  node: ActivityNode,
  newActivityType: string,
  catalog: Record<string, ActivityCatalogEntry> = ACTIVITY_CATALOG,
): SwapResult {
  const entry = catalog[newActivityType];
  if (!entry) {
    throw new Error(
      `swapActivityType: unknown target activity type "${newActivityType}".`,
    );
  }

  const oldParameters = node.parameters ?? {};
  const newParameters = buildSwappedParameters(entry, oldParameters);

  const inputPorts = new Set(entry.inputs.map((p) => p.name));
  const outputPorts = new Set(entry.outputs.map((p) => p.name));

  const dropped: DroppedBinding[] = [];
  const keptInputs = (node.inputs ?? []).filter((binding) => {
    if (inputPorts.has(binding.port)) return true;
    dropped.push({
      direction: "input",
      port: binding.port,
      ctxKey: binding.ctxKey,
    });
    return false;
  });
  const keptOutputs = (node.outputs ?? []).filter((binding) => {
    if (outputPorts.has(binding.port)) return true;
    dropped.push({
      direction: "output",
      port: binding.port,
      ctxKey: binding.ctxKey,
    });
    return false;
  });

  return {
    node: {
      id: node.id,
      type: "activity",
      label: node.label,
      activityType: newActivityType,
      parameters: newParameters,
      ...(node.inputs === undefined ? {} : { inputs: keptInputs }),
      ...(node.outputs === undefined ? {} : { outputs: keptOutputs }),
      errorPolicy: node.errorPolicy,
      retry: node.retry,
      timeout: node.timeout,
      metadata: pruneLockMetadata(node.metadata, inputPorts, outputPorts),
    },
    dropped,
  };
}

/**
 * Locks name a port, so a lock on a port the new type does not declare is as
 * stale as the binding was — and worse, it is durable and invisible:
 * `stripRedundantLocks` deliberately keeps a lock whose port has no binding
 * ("preserve explicit intent") and `normaliseLocks` re-infers it on load. If
 * the new type later gains a port with that name, the resolver refuses to
 * auto-wire it and reports `locked-unbound` with nothing the author can act on.
 */
function pruneLockMetadata(
  metadata: ActivityNode["metadata"],
  inputPorts: ReadonlySet<string>,
  outputPorts: ReadonlySet<string>,
): ActivityNode["metadata"] {
  if (!metadata) return metadata;
  const meta = metadata as {
    lockedInputPorts?: unknown;
    lockedOutputPorts?: unknown;
  };
  const next = { ...metadata } as Record<string, unknown>;
  if (Array.isArray(meta.lockedInputPorts)) {
    next.lockedInputPorts = meta.lockedInputPorts.filter(
      (port): port is string =>
        typeof port === "string" && inputPorts.has(port),
    );
  }
  if (Array.isArray(meta.lockedOutputPorts)) {
    next.lockedOutputPorts = meta.lockedOutputPorts.filter(
      (port): port is string =>
        typeof port === "string" && outputPorts.has(port),
    );
  }
  return next as ActivityNode["metadata"];
}
