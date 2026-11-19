/**
 * Generic bounded LRU cache with per-entry TTL.
 *
 * §6.2: consolidates the two hand-rolled backend LRU+TTL maps that had
 * subtly different eviction/TTL code — the per-group merged-catalog cache
 * (`CatalogCache`) and the per-version run-count cache in
 * `WorkflowController` — into one implementation.
 *
 * Semantics:
 *  - TTL is checked at read time; an entry is expired once
 *    `now - cachedAt >= ttlMs`, and an expired entry is dropped on read so
 *    it can't pin LRU capacity.
 *  - `get` refreshes recency (delete + re-insert moves the key to the
 *    most-recently-used position — `Map` preserves insertion order).
 *  - `set` evicts least-recently-used entries until the map is within
 *    `maxEntries`.
 *  - `now` is injectable for deterministic tests.
 */
export class LruTtlCache<V> {
  private readonly map = new Map<string, { value: V; cachedAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Returns the value, or `undefined` on miss / expiry (expired → dropped). */
  get(key: string): V | undefined {
    const entry = this.map.get(key);
    if (entry === undefined) return undefined;
    if (this.now() - entry.cachedAt >= this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    // Refresh recency.
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  /** Inserts/updates the value and evicts LRU entries beyond `maxEntries`. */
  set(key: string, value: V): void {
    this.map.delete(key);
    this.map.set(key, { value, cachedAt: this.now() });
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  /** Removes the entry for the key (no-op when absent). */
  delete(key: string): void {
    this.map.delete(key);
  }

  /** Current entry count (includes not-yet-read expired entries). */
  size(): number {
    return this.map.size;
  }
}
