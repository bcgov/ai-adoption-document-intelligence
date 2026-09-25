import type { JsonSchemaProperty } from "../json-schema-form";

/**
 * Saved parameter keys a node's current schema no longer declares (G-099).
 *
 * The params form renders from `Object.entries(schema.properties)`, so a key
 * with no matching property is never shown; the write-back spreads the existing
 * object and only touches the edited field, so the orphan survives every edit.
 * No activity `parametersSchema` uses `.strict()`, so Zod quietly strips the key
 * during validation — the value is dead weight that nothing displays and
 * nothing can remove.
 *
 * Surfaced rather than pruned automatically. A schema can legitimately lose a
 * property while the value is still wanted — switching a `dyn.` node's version
 * pin is exactly that — so deleting the author's data on open would lose work
 * that a pin change should be able to undo.
 */
export function findOrphanedParameterKeys(
  parameters: Record<string, unknown> | undefined,
  schemaProperties: Record<string, JsonSchemaProperty> | undefined,
): string[] {
  if (!parameters) return [];
  const declared = new Set(Object.keys(schemaProperties ?? {}));
  return Object.keys(parameters)
    .filter((key) => !declared.has(key))
    .sort();
}

/** Drop the given keys from a parameters object. Pure. */
export function removeParameterKeys(
  parameters: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  if (keys.length === 0) return parameters;
  const drop = new Set(keys);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parameters)) {
    if (!drop.has(key)) out[key] = value;
  }
  return out;
}
