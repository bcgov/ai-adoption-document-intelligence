/**
 * Phase 6 Milestone C (US-169) — worker-side LRU cache for `DynamicNodeVersion`
 * rows, keyed by the immutable `versionId`.
 *
 * The cache is per-worker (in-process, no cross-process state). It stays
 * naturally stale-free because `DynamicNodeVersion` rows are immutable —
 * publishing a new version mints a new `versionId`, which is its own cache
 * key. Capped at 256 entries to bound worker memory; eviction is strict LRU.
 *
 * The subprocess harness referenced in the user story lives server-side in
 * `apps/deno-runner/src/subprocess-harness.ts` (US-186) — the worker is a
 * thin HTTP client that passes the user-authored script body to the runner
 * unwrapped. The runner wraps it before spawning Deno.
 *
 * Cache miss → `loadVersion(versionId, prisma)` SELECTs the row, populates
 * the cache, and returns the entry. The cache holds the parsed `signature`
 * so callers don't re-parse the JSON column on hot paths.
 */

import type { DynamicNodeSignature } from "@ai-di/graph-workflow";
import type { PrismaClient } from "@generated/client";

const CACHE_CAP = 256;

/**
 * Single cached row. `script` is the raw user-authored source; the runner
 * appends its own harness before spawning Deno. `signature` is the JSDoc
 * declaration parsed at publish time (US-158) and persisted as
 * `dynamic_node_version.signature` JSON. `allowNet` is the
 * post-intersection host list (US-164). `deterministic` mirrors the
 * `@deterministic` tag (used by the cache decorator's `nonCacheable`
 * check — `deterministic === true` means cacheable).
 */
export interface ScriptCacheEntry {
  script: string;
  signature: DynamicNodeSignature;
  allowNet: string[];
  deterministic: boolean;
}

/**
 * Strict LRU cache built on `Map` insertion order. `get` re-inserts on hit
 * to bump recency; `set` evicts the oldest entry when full.
 */
class LruVersionCache {
  private readonly store = new Map<string, ScriptCacheEntry>();
  private readonly cap: number;

  constructor(cap: number) {
    this.cap = cap;
  }

  get(versionId: string): ScriptCacheEntry | undefined {
    const entry = this.store.get(versionId);
    if (entry === undefined) {
      return undefined;
    }
    // LRU: bump recency by re-inserting.
    this.store.delete(versionId);
    this.store.set(versionId, entry);
    return entry;
  }

  set(versionId: string, entry: ScriptCacheEntry): void {
    if (this.store.has(versionId)) {
      this.store.delete(versionId);
    } else if (this.store.size >= this.cap) {
      // Evict least-recently-used (the oldest key in insertion order).
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) {
        this.store.delete(oldest);
      }
    }
    this.store.set(versionId, entry);
  }

  delete(versionId: string): boolean {
    return this.store.delete(versionId);
  }

  size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }
}

/**
 * Module-level singleton — every `dyn.run` activity invocation goes through
 * this. Per-worker scope; multiple workers each maintain their own cache.
 */
export const versionCache = new LruVersionCache(CACHE_CAP);

/**
 * Cache-miss helper. On miss, SELECTs the row from `dynamic_node_version`
 * and populates the cache. Returns the entry whether served from cache or
 * just loaded.
 *
 * Throws if the row does not exist — the executor (US-171) guarantees a
 * valid `versionId` before invoking `dyn.run`, so a missing row here is a
 * data-integrity error rather than a runtime failure mode.
 */
export async function loadVersion(
  versionId: string,
  prisma: PrismaClient,
): Promise<ScriptCacheEntry> {
  const cached = versionCache.get(versionId);
  if (cached !== undefined) {
    return cached;
  }

  const row = await prisma.dynamicNodeVersion.findUnique({
    where: { id: versionId },
    select: {
      script: true,
      signature: true,
      allowNet: true,
      deterministic: true,
    },
  });

  if (row === null) {
    throw new Error(
      `DynamicNodeVersion ${versionId} not found — executor-side resolution should have caught this`,
    );
  }

  const entry: ScriptCacheEntry = {
    script: row.script,
    signature: row.signature as unknown as DynamicNodeSignature,
    allowNet: row.allowNet,
    deterministic: row.deterministic,
  };
  versionCache.set(versionId, entry);
  return entry;
}
