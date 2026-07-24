/**
 * Context namespace utilities for graph workflow validation.
 *
 * Defines the canonical mapping from short-form ctx-ref namespace prefixes
 * to the actual ctx field they resolve to. Single source of truth so runtime
 * resolvers and validators agree on what `doc.X` / `segment.X` mean.
 *
 * Add a new namespace here and both the schema validator and the temporal
 * runtime context resolver pick it up automatically.
 */

/**
 * Mapping from short-form ctx-ref namespace prefixes to the actual ctx field
 * they resolve to.
 */
export const CTX_NAMESPACE_PREFIXES: Record<string, string> = {
  doc: "documentMetadata",
  segment: "currentSegment",
};

/**
 * Returns the ctx field name (top-level key under `ctx`) that a port-binding
 * or non-`ctx.`-prefixed ref path resolves to. `doc.X` returns
 * `"documentMetadata"`, `segment.X` returns `"currentSegment"`, anything else
 * returns its first dot-segment unchanged.
 *
 * Used by validators to check the resolved root against declared ctx keys.
 */
export function getCtxRootKey(ctxKey: string): string {
  const dotIdx = ctxKey.indexOf(".");
  const namespace = dotIdx === -1 ? ctxKey : ctxKey.slice(0, dotIdx);
  return CTX_NAMESPACE_PREFIXES[namespace] ?? namespace;
}

/**
 * Returns the ctx root key for a ref-style path that uses a namespace prefix
 * (`ctx.X.Y` → `X`; `doc.X` / `segment.X` → their underlying ctx field).
 * Returns undefined for refs that don't address ctx (e.g. `param.X`, `row.X`,
 * `now`) so callers can skip the declared-key check for those.
 *
 * Used by the schema validator on expression refs.
 */
export function getRefCtxRootKey(refPath: string): string | undefined {
  const parts = refPath.split(".");
  const namespace = parts[0];
  if (namespace === "ctx" && parts.length >= 2) return parts[1];
  return CTX_NAMESPACE_PREFIXES[namespace];
}
