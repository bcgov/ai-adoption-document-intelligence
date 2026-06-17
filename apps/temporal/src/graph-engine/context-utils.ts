/**
 * Context Utilities
 *
 * Read/write operations for workflow context with namespace resolution.
 */

import {
  CTX_NAMESPACE_PREFIXES,
  getCtxRootKey,
  getRefCtxRootKey,
} from "@ai-di/graph-workflow";
import type { GraphWorkflowConfig } from "../graph-workflow-types";

export { CTX_NAMESPACE_PREFIXES, getCtxRootKey, getRefCtxRootKey };

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
