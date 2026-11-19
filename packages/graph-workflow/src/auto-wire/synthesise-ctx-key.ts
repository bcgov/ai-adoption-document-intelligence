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

/**
 * Inverse of `synthesiseCtxKey`: recover the producing `(nodeId, port)` an
 * auto ctx key names. `port` is the LAST dot-segment, so a node id containing
 * dots survives the round trip. Returns null for non-auto keys and for auto
 * keys with no port segment.
 *
 * An auto key IS its own producer reference — the resolver stamps the matching
 * `outputs[]` row on the named node whenever it runs — so this is what lets a
 * source lookup tell "the producer is still there" from "the producer was
 * deleted" without depending on that row having been stamped yet.
 */
export function decodeAutoCtxKey(
  ctxKey: string,
): { nodeId: string; port: string } | null {
  if (!isAutoCtxKey(ctxKey)) return null;
  const withoutPrefix = ctxKey.slice(AUTO_CTX_KEY_PREFIX.length);
  const dotIdx = withoutPrefix.lastIndexOf(".");
  if (dotIdx <= 0) return null;
  const port = withoutPrefix.slice(dotIdx + 1);
  if (port === "") return null;
  return { nodeId: withoutPrefix.slice(0, dotIdx), port };
}
