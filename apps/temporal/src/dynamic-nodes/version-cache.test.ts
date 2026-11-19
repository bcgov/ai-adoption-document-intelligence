/**
 * Tests for the Phase 6 Milestone C (US-169) worker-side LRU version cache.
 *
 * Verifies the three guarantees the `dyn.run` activity (US-170) relies on:
 *   - `get` after `set` returns the entry
 *   - `set` past the cap evicts the least-recently-used entry
 *   - `delete(versionId)` removes the entry
 *   - `loadVersion(versionId, prisma)` on miss populates the cache from
 *     a SELECT against `dynamic_node_version`
 */

import type { DynamicNodeSignature } from "@ai-di/graph-workflow";
import type { PrismaClient } from "@generated/client";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  loadVersion,
  type ScriptCacheEntry,
  versionCache,
} from "./version-cache";

function makeSignature(name = "my-node"): DynamicNodeSignature {
  return {
    name,
    description: "test",
    category: "Custom",
    deterministic: false,
    inputs: [],
    outputs: [],
    paramsSchema: {},
    allowNet: [],
    timeoutMs: 60_000,
    maxMemoryMB: 256,
  };
}

function makeEntry(name = "my-node"): ScriptCacheEntry {
  return {
    script: `export default async function () { return {}; }`,
    signature: makeSignature(name),
    allowNet: [],
    deterministic: false,
  };
}

describe("versionCache — Scenario 2: 256-entry LRU map basics", () => {
  beforeEach(() => versionCache.clear());

  it("get returns the entry after set", () => {
    const entry = makeEntry();
    versionCache.set("v1", entry);
    expect(versionCache.get("v1")).toBe(entry);
    expect(versionCache.size()).toBe(1);
  });

  it("delete removes the entry", () => {
    versionCache.set("v1", makeEntry());
    expect(versionCache.delete("v1")).toBe(true);
    expect(versionCache.get("v1")).toBeUndefined();
    expect(versionCache.size()).toBe(0);
  });

  it("get returns undefined on miss", () => {
    expect(versionCache.get("missing")).toBeUndefined();
  });
});

describe("versionCache — Scenario 4: LRU eviction at 256+1", () => {
  beforeEach(() => versionCache.clear());

  it("evicts the least-recently-used entry on the 257th set", () => {
    // Fill the cache to its cap of 256.
    for (let i = 0; i < 256; i++) {
      versionCache.set(`v${i}`, makeEntry(`node-${i}`));
    }
    expect(versionCache.size()).toBe(256);

    // Insert a 257th — v0 (least recently used) should evict.
    versionCache.set("v256", makeEntry("node-256"));
    expect(versionCache.size()).toBe(256);
    expect(versionCache.get("v0")).toBeUndefined();
    expect(versionCache.get("v256")).toBeDefined();
  });

  it("get bumps recency so a subsequently inserted entry evicts the next-oldest", () => {
    for (let i = 0; i < 256; i++) {
      versionCache.set(`v${i}`, makeEntry(`node-${i}`));
    }
    // Bump v0 to most-recently-used.
    versionCache.get("v0");

    // Insert v256 — v1 should evict now, not v0.
    versionCache.set("v256", makeEntry("node-256"));
    expect(versionCache.get("v0")).toBeDefined();
    expect(versionCache.get("v1")).toBeUndefined();
  });

  it("re-setting an existing key does not change the size", () => {
    versionCache.set("v1", makeEntry("a"));
    versionCache.set("v1", makeEntry("b"));
    expect(versionCache.size()).toBe(1);
  });
});

describe("loadVersion — Scenario 3: cache-miss SELECTs and populates", () => {
  beforeEach(() => versionCache.clear());

  it("on miss, SELECTs the row and populates the cache", async () => {
    const findUnique = jest.fn<() => Promise<unknown>>().mockResolvedValue({
      script: "export default async () => ({});",
      signature: makeSignature(),
      allowNet: ["api.example.com"],
      deterministic: false,
    });
    const prisma = {
      dynamicNodeVersion: { findUnique },
    };

    const entry = await loadVersion("v1", prisma as unknown as PrismaClient);
    expect(entry.script).toContain("export default");
    expect(entry.allowNet).toEqual(["api.example.com"]);
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(versionCache.get("v1")).toBe(entry);
  });

  it("on hit, returns from cache without querying", async () => {
    const cached = makeEntry();
    versionCache.set("v1", cached);
    const findUnique = jest.fn<() => Promise<unknown>>();
    const prisma = {
      dynamicNodeVersion: { findUnique },
    };

    const entry = await loadVersion("v1", prisma as unknown as PrismaClient);
    expect(entry).toBe(cached);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("throws if the row does not exist (executor should have caught it)", async () => {
    const findUnique = jest
      .fn<() => Promise<unknown>>()
      .mockResolvedValue(null);
    const prisma = {
      dynamicNodeVersion: { findUnique },
    };

    await expect(
      loadVersion("missing", prisma as unknown as PrismaClient),
    ).rejects.toThrow(/DynamicNodeVersion missing not found/);
  });
});
