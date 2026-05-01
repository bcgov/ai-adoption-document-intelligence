/**
 * Context Utilities
 *
 * Read/write operations for workflow context with namespace resolution.
 */

import type { GraphWorkflowConfig } from "../graph-workflow-types";

/** Rejects path segments that would be unsafe as plain object property names. */
export function isSafeContextKeySegment(key: string): boolean {
  return (
    key.length > 0 &&
    key !== "__proto__" &&
    key !== "constructor" &&
    key !== "prototype"
  );
}

/**
 * Mapping from short-form ctx-ref namespace prefixes to the actual ctx field
 * they resolve to. Single source of truth so runtime resolvers and validators
 * agree on what `doc.X` / `segment.X` mean. Add a new namespace here and both
 * `resolvePortBinding`/`writeToCtx` (runtime) and the schema validator pick
 * it up automatically.
 */
const CTX_NAMESPACE_PREFIXES: Record<string, string> = {
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

/**
 * Substitutes a leading namespace prefix (e.g. `doc.`) with the underlying
 * ctx key (e.g. `documentMetadata.`). Paths without a known namespace are
 * returned unchanged. Used by runtime ctx read/write so the resolver and the
 * validator share one source of truth (`CTX_NAMESPACE_PREFIXES`).
 */
function applyCtxNamespace(ctxKey: string): string {
  const dotIdx = ctxKey.indexOf(".");
  if (dotIdx === -1) return CTX_NAMESPACE_PREFIXES[ctxKey] ?? ctxKey;
  const ns = ctxKey.slice(0, dotIdx);
  const remap = CTX_NAMESPACE_PREFIXES[ns];
  return remap ? `${remap}${ctxKey.slice(dotIdx)}` : ctxKey;
}

/**
 * Initialize runtime context by merging initialCtx over config ctx defaults
 */
export function initializeContext(
  config: GraphWorkflowConfig,
  initialCtx: Record<string, unknown>,
): Record<string, unknown> {
  const ctx: Record<string, unknown> = Object.create(null) as Record<
    string,
    unknown
  >;

  // Apply defaults from config
  for (const [key, declaration] of Object.entries(config.ctx)) {
    if (!isSafeContextKeySegment(key)) {
      continue;
    }
    if (declaration.defaultValue !== undefined) {
      ctx[key] = declaration.defaultValue;
    }
  }

  // Overlay initial values
  for (const [key, value] of Object.entries(initialCtx)) {
    if (!isSafeContextKeySegment(key)) {
      continue;
    }
    ctx[key] = value;
  }

  return ctx;
}

/**
 * Resolve a port binding from context using dot notation
 *
 * Supports:
 * - Simple keys: "documentId"
 * - Dot notation: "currentSegment.blobKey"
 * - Namespaces: "doc.field" -> "ctx.documentMetadata.field"
 */
export function resolvePortBinding(
  ctxKey: string,
  ctx: Record<string, unknown>,
): unknown {
  const resolvedKey = applyCtxNamespace(ctxKey);

  // Traverse path using dot notation
  const keys = resolvedKey.split(".");
  for (const key of keys) {
    if (!isSafeContextKeySegment(key)) {
      return undefined;
    }
  }

  let value: unknown = ctx;

  for (const key of keys) {
    if (value == null || typeof value !== "object") {
      return undefined;
    }
    value = (value as Record<string, unknown>)[key];
  }

  return value;
}

/**
 * Write a value to context using dot notation
 */
export function writeToCtx(
  ctxKey: string,
  value: unknown,
  ctx: Record<string, unknown>,
): void {
  const resolvedKey = applyCtxNamespace(ctxKey);
  const keys = resolvedKey.split(".");
  for (const key of keys) {
    if (!isSafeContextKeySegment(key)) {
      throw new Error(`Invalid context key segment: ${key}`);
    }
  }

  let current = ctx;

  // Navigate to parent of target key
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || typeof current[key] !== "object") {
      current[key] = Object.create(null);
    }
    current = current[key] as Record<string, unknown>;
  }

  // Set the final key
  const finalKey = keys[keys.length - 1];
  current[finalKey] = value;
}
