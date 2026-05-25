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
 *   - all other fields (`id`, `label`, `inputs`, `outputs`, `errorPolicy`,
 *     `retry`, `timeout`, `metadata`) are carried over verbatim.
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
): ActivityNode {
  const entry = catalog[newActivityType];
  if (!entry) {
    throw new Error(
      `swapActivityType: unknown target activity type "${newActivityType}".`,
    );
  }

  const oldParameters = node.parameters ?? {};
  const newParameters = buildSwappedParameters(entry, oldParameters);

  return {
    id: node.id,
    type: "activity",
    label: node.label,
    activityType: newActivityType,
    parameters: newParameters,
    inputs: node.inputs,
    outputs: node.outputs,
    errorPolicy: node.errorPolicy,
    retry: node.retry,
    timeout: node.timeout,
    metadata: node.metadata,
  };
}
