import type { GraphWorkflowConfig, GraphNode } from "../types";
import { upstreamNodesWithDistance } from "./upstream-walk";

function makeConfig(
  edges: { source: string; target: string }[],
  nodes: Record<string, GraphNode> = {},
): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "t" },
    nodes,
    edges: edges.map((e, i) => ({
      id: `e${i}`,
      source: e.source,
      target: e.target,
      type: "normal" as const,
    })),
    entryNodeId: "",
    ctx: {},
  };
}

/** A map node whose body runs entry→exit. Reached by setting, not by edge. */
function mapNode(
  id: string,
  bodyEntryNodeId: string,
  bodyExitNodeId: string,
): GraphNode {
  return {
    id,
    type: "map",
    label: id,
    collectionCtxKey: "items",
    itemCtxKey: "item",
    bodyEntryNodeId,
    bodyExitNodeId,
  } as GraphNode;
}

describe("upstreamNodesWithDistance", () => {
  it("returns an empty map for a node with no upstream edges", () => {
    const cfg = makeConfig([]);
    expect(upstreamNodesWithDistance(cfg, "A")).toEqual(new Map());
  });

  it("yields direct predecessor at distance 1", () => {
    const cfg = makeConfig([{ source: "A", target: "B" }]);
    expect(upstreamNodesWithDistance(cfg, "B")).toEqual(new Map([["A", 1]]));
  });

  it("yields transitive ancestors with their BFS distance", () => {
    const cfg = makeConfig([
      { source: "A", target: "B" },
      { source: "B", target: "C" },
      { source: "C", target: "D" },
    ]);
    expect(upstreamNodesWithDistance(cfg, "D")).toEqual(
      new Map([
        ["C", 1],
        ["B", 2],
        ["A", 3],
      ]),
    );
  });

  it("returns the shortest distance when multiple paths converge", () => {
    // A → B → D; A → C → D — A reaches D via length-2 paths through B and C.
    const cfg = makeConfig([
      { source: "A", target: "B" },
      { source: "A", target: "C" },
      { source: "B", target: "D" },
      { source: "C", target: "D" },
    ]);
    const result = upstreamNodesWithDistance(cfg, "D");
    expect(result.get("A")).toBe(2);
    expect(result.get("B")).toBe(1);
    expect(result.get("C")).toBe(1);
  });

  it("terminates on a cyclic graph (defensive guard)", () => {
    // Cycles are forbidden by the schema, but the resolver must not loop.
    const cfg = makeConfig([
      { source: "A", target: "B" },
      { source: "B", target: "A" },
    ]);
    expect(() => upstreamNodesWithDistance(cfg, "B")).not.toThrow();
  });

  // ---- G-106 ruling A: a map's body is inside the map's scope ----
  describe("map body membership (G-106)", () => {
    it("sees the map from its body entry, with no edge drawn (ruling A)", () => {
      // The map reaches its body ONLY through bodyEntryNodeId — the shape
      // both shipped maps have. Before ruling A the body saw nothing at all.
      const cfg = makeConfig([], { m: mapNode("m", "entry", "entry") });
      expect(upstreamNodesWithDistance(cfg, "entry").get("m")).toBe(1);
    });

    it("carries the map's own upstream view into the body", () => {
      // pre → m (edge), m ⇢ entry (setting). From inside the body the author
      // can reach values produced before the loop.
      const cfg = makeConfig([{ source: "pre", target: "m" }], {
        m: mapNode("m", "entry", "exit"),
      });
      const result = upstreamNodesWithDistance(cfg, "entry");
      expect(result.get("m")).toBe(1);
      expect(result.get("pre")).toBe(2);
    });

    it("ranks the map nearer than anything outside it", () => {
      // The loop item must win a same-kind tie against an outside producer,
      // otherwise every binding inside a loop turns ambiguous.
      const cfg = makeConfig([{ source: "pre", target: "m" }], {
        m: mapNode("m", "entry", "exit"),
      });
      const result = upstreamNodesWithDistance(cfg, "entry");
      expect(result.get("m")!).toBeLessThan(result.get("pre")!);
    });

    it("ranks an in-body producer nearer than the map", () => {
      // A value produced inside the iteration is more local than the item.
      const cfg = makeConfig([{ source: "entry", target: "second" }], {
        m: mapNode("m", "entry", "second"),
      });
      const result = upstreamNodesWithDistance(cfg, "second");
      expect(result.get("entry")).toBe(1);
      expect(result.get("m")).toBe(2);
    });

    it("reaches dead-end branch nodes that never rejoin the exit", () => {
      // entry → deadEnd is a branch that never reaches the body exit; it is
      // still inside the loop, so it must still see the map (matches 4.15).
      const cfg = makeConfig(
        [
          { source: "entry", target: "deadEnd" },
          { source: "entry", target: "exit" },
        ],
        { m: mapNode("m", "entry", "exit") },
      );
      expect(upstreamNodesWithDistance(cfg, "deadEnd").get("m")).toBe(2);
    });

    it("still honours a real edge from the map to its body entry", () => {
      // Belt and braces: an author who DID draw the edge gets distance 1,
      // not 2 — the virtual link must not double-count.
      const cfg = makeConfig([{ source: "m", target: "entry" }], {
        m: mapNode("m", "entry", "exit"),
      });
      expect(upstreamNodesWithDistance(cfg, "entry").get("m")).toBe(1);
    });

    it("does not leak the map to nodes outside its body", () => {
      const cfg = makeConfig([{ source: "pre", target: "m" }], {
        m: mapNode("m", "entry", "exit"),
      });
      expect(upstreamNodesWithDistance(cfg, "m").has("m")).toBe(false);
    });

    it("terminates when a map's body entry is the map itself", () => {
      // Malformed but must not hang.
      const cfg = makeConfig([], { m: mapNode("m", "m", "m") });
      expect(() => upstreamNodesWithDistance(cfg, "m")).not.toThrow();
    });
  });
});
