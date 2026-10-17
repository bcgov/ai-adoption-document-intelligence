import { LruTtlCache } from "./lru-ttl-cache";

describe("LruTtlCache (§6.2)", () => {
  it("returns a stored value within the TTL and undefined on miss", () => {
    let now = 1_000_000;
    const cache = new LruTtlCache<number>(1000, 16, () => now);
    cache.set("a", 42);
    now += 500;
    expect(cache.get("a")).toBe(42);
    expect(cache.get("missing")).toBeUndefined();
  });

  it("expires (and drops) an entry once now - cachedAt >= ttlMs", () => {
    let now = 1_000_000;
    const cache = new LruTtlCache<number>(1000, 16, () => now);
    cache.set("a", 1);
    now += 1000; // exactly at the TTL boundary → expired
    expect(cache.get("a")).toBeUndefined();
    expect(cache.size()).toBe(0);
  });

  it("evicts the least-recently-used entry when over maxEntries", () => {
    const cache = new LruTtlCache<number>(10_000, 2, () => 0);
    cache.set("a", 1);
    cache.set("b", 2);
    // Touch "a" so "b" becomes the LRU.
    expect(cache.get("a")).toBe(1);
    cache.set("c", 3); // over cap → evict LRU ("b")
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    expect(cache.get("c")).toBe(3);
    expect(cache.size()).toBe(2);
  });

  it("get refreshes recency so a touched entry survives eviction", () => {
    const cache = new LruTtlCache<string>(10_000, 2, () => 0);
    cache.set("x", "1");
    cache.set("y", "2");
    cache.get("x"); // x is now most-recent
    cache.set("z", "3"); // evicts y (LRU)
    expect(cache.get("y")).toBeUndefined();
    expect(cache.get("x")).toBe("1");
  });

  it("delete removes an entry (no-op when absent)", () => {
    const cache = new LruTtlCache<number>(10_000, 16, () => 0);
    cache.set("a", 1);
    cache.delete("a");
    cache.delete("nope");
    expect(cache.get("a")).toBeUndefined();
    expect(cache.size()).toBe(0);
  });
});
