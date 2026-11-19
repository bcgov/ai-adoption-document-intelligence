/**
 * Pure helper that materialises the default value for a dynamic node's
 * parameters (Phase 6 US-182, Milestone F).
 *
 * The merged activity catalog (`useActivityCatalog`) returns dynamic
 * entries with `paramsSchema` as a JSON Schema 7 object. When the user
 * drops a dynamic node on the canvas (or the editor's "+ New custom
 * node" modal lands a successful publish) we need to seed `node.parameters`
 * with the schema's documented defaults so the node is valid out of the
 * gate.
 *
 * This walker is intentionally minimal — only `type: "object"` schemas
 * with property-level `default` values are honoured. That's the only
 * shape the dynamic-node signature parser emits today
 * (`@ai-di/graph-workflow`'s jsdoc-driven schema builder), and anything
 * more elaborate would require a JSON-Schema runtime which the project
 * intentionally avoids.
 */

interface JsonSchemaLike {
  type?: string;
  properties?: Record<string, JsonSchemaLike>;
  default?: unknown;
}

export function materialiseParamDefaults(
  schema: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!schema) return {};
  const cast = schema as JsonSchemaLike;
  if (cast.type !== "object") return {};
  const out: Record<string, unknown> = {};
  const props = cast.properties ?? {};
  for (const [key, prop] of Object.entries(props)) {
    if (prop.default !== undefined) {
      out[key] = prop.default;
    }
  }
  return out;
}
