/**
 * Reserved prefix for auto-synthesised ctx keys. Hand-authored ctx keys
 * (template files, library workflow ports, `config.ctx` declarations)
 * MUST NOT start with this string — the resolver treats any binding whose
 * ctx key does NOT start with this prefix as a user-authored override at
 * load time. See AUTO_WIRE_DESIGN.md §2.2.
 */
export const AUTO_CTX_KEY_PREFIX = "__auto.";

/**
 * Synthesise the canonical auto ctx key for `port` on `nodeId`. Stable
 * across renames (node id is the stable handle).
 */
export function synthesiseCtxKey(nodeId: string, port: string): string {
  return `${AUTO_CTX_KEY_PREFIX}${nodeId}.${port}`;
}

/**
 * `true` iff `ctxKey` was produced by `synthesiseCtxKey`.
 */
export function isAutoCtxKey(ctxKey: string): boolean {
  return ctxKey.startsWith(AUTO_CTX_KEY_PREFIX);
}
