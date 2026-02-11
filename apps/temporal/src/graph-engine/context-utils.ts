/**
 * Context Utilities
 *
 * Read/write operations for workflow context with namespace resolution.
 */

import type { GraphWorkflowConfig } from '../graph-workflow-types';

/**
 * Initialize runtime context by merging initialCtx over config ctx defaults
 */
export function initializeContext(
  config: GraphWorkflowConfig,
  initialCtx: Record<string, unknown>,
): Record<string, unknown> {
  const ctx: Record<string, unknown> = {};

  // Apply defaults from config
  for (const [key, declaration] of Object.entries(config.ctx)) {
    if (declaration.defaultValue !== undefined) {
      ctx[key] = declaration.defaultValue;
    }
  }

  // Overlay initial values
  for (const [key, value] of Object.entries(initialCtx)) {
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
  // Handle namespaces
  let resolvedKey = ctxKey;
  if (ctxKey.startsWith('doc.')) {
    resolvedKey = `documentMetadata.${ctxKey.slice(4)}`;
  } else if (ctxKey.startsWith('segment.')) {
    resolvedKey = `currentSegment.${ctxKey.slice(8)}`;
  }

  // Traverse path using dot notation
  const keys = resolvedKey.split('.');
  let value: unknown = ctx;

  for (const key of keys) {
    if (value == null || typeof value !== 'object') {
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
  // Handle namespaces
  let resolvedKey = ctxKey;
  if (ctxKey.startsWith('doc.')) {
    resolvedKey = `documentMetadata.${ctxKey.slice(4)}`;
  } else if (ctxKey.startsWith('segment.')) {
    resolvedKey = `currentSegment.${ctxKey.slice(8)}`;
  }

  const keys = resolvedKey.split('.');
  let current = ctx;

  // Navigate to parent of target key
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  // Set the final key
  const finalKey = keys[keys.length - 1];
  current[finalKey] = value;
}
