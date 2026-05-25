import type { ActivityCatalogEntry } from "@ai-di/graph-workflow";

/**
 * Per-group server-side cache of the merged activity catalog.
 *
 * Phase 6 US-173 Scenario 4 requires that 100 catalog requests within 1 s
 * from the same group consult the database at most once for the group's
 * dynamic-node lineages. Mutations (POST/PUT/DELETE on
 * `/api/dynamic-nodes`) invalidate the calling group's cached entry so
 * the next read sees the latest snapshot.
 *
 * Implementation notes:
 *  - Bounded LRU (eviction on insert when over `maxEntries`).
 *  - TTL is checked at read time; expired rows resolve as "miss".
 *  - Singleton-friendly — `DynamicNodesService` holds one instance and
 *    every controller call funnels through it.
 *
 * Not exported from the module's index — this class lives in the
 * dynamic-nodes feature folder and is consumed exclusively by
 * `DynamicNodesService.getMergedCatalogForGroup` +
 * `DynamicNodesService.invalidateGroupCatalogCache`.
 */
export class CatalogCache {
  private readonly map = new Map<string, CachedCatalogEntry>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /**
   * Returns the cached dynamic-entry list for the group, or `undefined`
   * when the entry is absent OR expired. On a hit, refreshes the LRU
   * recency for the key (delete + re-insert moves it to the end).
   */
  get(groupId: string): ActivityCatalogEntry[] | undefined {
    const entry = this.map.get(groupId);
    if (entry === undefined) return undefined;
    if (this.now() - entry.cachedAt > this.ttlMs) {
      this.map.delete(groupId);
      return undefined;
    }
    // Refresh recency.
    this.map.delete(groupId);
    this.map.set(groupId, entry);
    return entry.entries;
  }

  /**
   * Inserts the entries for the group. Evicts the least-recently-used
   * entry when the cache would exceed `maxEntries`.
   */
  set(groupId: string, entries: ActivityCatalogEntry[]): void {
    if (this.map.has(groupId)) {
      this.map.delete(groupId);
    } else if (this.map.size >= this.maxEntries) {
      const firstKey = this.map.keys().next().value;
      if (firstKey !== undefined) {
        this.map.delete(firstKey);
      }
    }
    this.map.set(groupId, { entries, cachedAt: this.now() });
  }

  /**
   * Removes the cached entry for the group (no-op when the key is
   * absent). Called by `DynamicNodesService.invalidateGroupCatalogCache`
   * from the POST/PUT/DELETE handlers after a successful DB write.
   */
  invalidate(groupId: string): void {
    this.map.delete(groupId);
  }

  /** Test-only inspection of the current cache size. */
  size(): number {
    return this.map.size;
  }
}

interface CachedCatalogEntry {
  entries: ActivityCatalogEntry[];
  cachedAt: number;
}

/** Per-group cache TTL — US-173 Scenario 4 (30 s). */
export const CATALOG_CACHE_TTL_MS = 30_000;

/** Bound on the LRU — keeps memory predictable in multi-tenant deployments. */
export const CATALOG_CACHE_MAX_ENTRIES = 256;
