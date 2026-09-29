import type { ActivityCatalogEntry } from "@ai-di/graph-workflow";
import { CatalogCache } from "./catalog-cache";

function makeEntry(slug: string): ActivityCatalogEntry {
  return {
    activityType: `dyn.${slug}`,
    category: "Custom",
    description: "fixture",
    iconHint: "dyn",
    colorHint: "dyn",
    inputs: [],
    outputs: [],
    dynamicNodeSlug: slug,
    dynamicNodeVersion: 1,
    allowNet: [],
    paramsSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  };
}

describe("CatalogCache", () => {
  it("returns undefined on miss", () => {
    const cache = new CatalogCache(1000, 16);
    expect(cache.get("g-1")).toBeUndefined();
  });

  it("returns the stored entries on hit (within TTL)", () => {
    let now = 1_000_000;
    const cache = new CatalogCache(1000, 16, () => now);
    cache.set("g-1", [makeEntry("a")]);
    now += 500;
    const hit = cache.get("g-1");
    expect(hit).toBeDefined();
    expect(hit?.[0].dynamicNodeSlug).toBe("a");
  });

  it("returns undefined after the TTL elapses", () => {
    let now = 1_000_000;
    const cache = new CatalogCache(1000, 16, () => now);
    cache.set("g-1", [makeEntry("a")]);
    now += 1500;
    expect(cache.get("g-1")).toBeUndefined();
    // The expired entry is purged on read.
    expect(cache.size()).toBe(0);
  });

  it("evicts the least-recently-used entry when the cap is exceeded", () => {
    const cache = new CatalogCache(1000, 2);
    cache.set("g-1", [makeEntry("a")]);
    cache.set("g-2", [makeEntry("b")]);
    // Touch g-1 so g-2 becomes the LRU.
    cache.get("g-1");
    cache.set("g-3", [makeEntry("c")]);
    expect(cache.get("g-2")).toBeUndefined();
    expect(cache.get("g-1")).toBeDefined();
    expect(cache.get("g-3")).toBeDefined();
  });

  it("invalidate() drops the entry for a single group only", () => {
    const cache = new CatalogCache(1000, 16);
    cache.set("g-1", [makeEntry("a")]);
    cache.set("g-2", [makeEntry("b")]);
    cache.invalidate("g-1");
    expect(cache.get("g-1")).toBeUndefined();
    expect(cache.get("g-2")).toBeDefined();
  });

  it("isolates entries across groups (US-173 Scenario 3)", () => {
    const cache = new CatalogCache(1000, 16);
    cache.set("g-1", [makeEntry("a"), makeEntry("b")]);
    cache.set("g-2", [makeEntry("c")]);
    expect(cache.get("g-1")?.length).toBe(2);
    expect(cache.get("g-2")?.length).toBe(1);
  });
});
