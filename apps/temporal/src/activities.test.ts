/**
 * Unit tests for enrichment-related activity helpers used by the ocr.enrich activity.
 * mergeKeyValuePairs is from enrichment-rules.
 */

import { mergeKeyValuePairs } from "./activities/enrichment-rules";
import type { KeyValuePair } from "./types";

function makeKeyValuePair(
  key: string,
  value: string,
  confidence: number,
): KeyValuePair {
  return {
    key: { content: key, boundingRegions: [], spans: [] },
    value: { content: value, boundingRegions: [], spans: [] },
    confidence,
  };
}

describe("mergeKeyValuePairs (enrichment-rules)", () => {
  it("overlays enriched pairs onto base by key", () => {
    const base = [
      makeKeyValuePair("a", "1", 0.8),
      makeKeyValuePair("b", "2", 0.7),
    ];
    const overlay = [
      { key: "b", value: "2-corrected", confidence: 0.95 },
      { key: "c", value: "3-new", confidence: 0.9 },
    ];
    const merged = mergeKeyValuePairs(base, overlay);
    expect(merged).toHaveLength(3);
    const byKey = new Map(merged.map((p) => [p.key?.content ?? "", p]));
    expect(byKey.get("a")?.value?.content).toBe("1");
    expect(byKey.get("b")?.value?.content).toBe("2-corrected");
    expect(byKey.get("c")?.value?.content).toBe("3-new");
  });

  it("returns base when overlay is empty", () => {
    const base = [makeKeyValuePair("a", "1", 0.8)];
    const merged = mergeKeyValuePairs(base, []);
    expect(merged).toHaveLength(1);
    expect(merged[0].key?.content).toBe("a");
  });

  it("returns overlay when base is empty", () => {
    const overlay = [{ key: "x", value: "1", confidence: 0.9 }];
    const merged = mergeKeyValuePairs([], overlay);
    expect(merged).toHaveLength(1);
    expect(merged[0].key?.content).toBe("x");
  });

  it("trims key and value content when applying rules", () => {
    const base = [
      makeKeyValuePair("  key1  ", "  value1  ", 0.8),
      makeKeyValuePair("key2", "value2", 0.9),
    ];
    const merged = mergeKeyValuePairs(base, []);
    expect(merged).toHaveLength(2);
    const byKey = new Map(merged.map((p) => [p.key?.content ?? "", p]));
    expect(byKey.get("key1")?.value?.content).toBe("value1");
    expect(byKey.get("key2")?.value?.content).toBe("value2");
  });
});
