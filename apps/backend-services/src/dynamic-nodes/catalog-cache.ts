import type { ActivityCatalogEntry } from "@ai-di/graph-workflow";
import { LruTtlCache } from "@/cache/lru-ttl-cache";

/**
 * Per-group server-side cache of the merged activity catalog.
 *
 * Phase 6 US-173 Scenario 4 requires that 100 catalog requests within 1 s
 * from the same group consult the database at most once for the group's
 * dynamic-node lineages. Mutations (POST/PUT/DELETE on
 * `/api/dynamic-nodes`) invalidate the calling group's cached entry so
 * the next read sees the latest snapshot.
 *
 * §6.2: a thin domain wrapper around the shared `LruTtlCache` (bounded LRU +
 * read-time TTL) so the eviction/TTL logic isn't hand-rolled here.
 * Singleton-friendly — `DynamicNodesService` holds one instance and every
 * controller call funnels through it.
 *
 * Not exported from the module's index — this class lives in the
 * dynamic-nodes feature folder and is consumed exclusively by
 * `DynamicNodesService.getMergedCatalogForGroup` +
 * `DynamicNodesService.invalidateGroupCatalogCache`.
 */
export class CatalogCache {
  private readonly cache: LruTtlCache<ActivityCatalogEntry[]>;

  constructor(ttlMs: number, maxEntries: number, now?: () => number) {
    this.cache = new LruTtlCache<ActivityCatalogEntry[]>(
      ttlMs,
      maxEntries,
      now,
    );
  }

  /**
   * Returns the cached dynamic-entry list for the group, or `undefined`
   * when the entry is absent OR expired (expired rows are dropped on read).
   */
  get(groupId: string): ActivityCatalogEntry[] | undefined {
    return this.cache.get(groupId);
  }

  /**
   * Inserts the entries for the group. Evicts the least-recently-used
   * entry when the cache would exceed `maxEntries`.
   */
  set(groupId: string, entries: ActivityCatalogEntry[]): void {
    this.cache.set(groupId, entries);
  }

  /**
   * Removes the cached entry for the group (no-op when the key is
   * absent). Called by `DynamicNodesService.invalidateGroupCatalogCache`
   * from the POST/PUT/DELETE handlers after a successful DB write.
   */
  invalidate(groupId: string): void {
    this.cache.delete(groupId);
  }

  /** Test-only inspection of the current cache size. */
  size(): number {
    return this.cache.size();
  }
}

/** Per-group cache TTL — US-173 Scenario 4 (30 s). */
export const CATALOG_CACHE_TTL_MS = 30_000;

/** Bound on the LRU — keeps memory predictable in multi-tenant deployments. */
export const CATALOG_CACHE_MAX_ENTRIES = 256;
