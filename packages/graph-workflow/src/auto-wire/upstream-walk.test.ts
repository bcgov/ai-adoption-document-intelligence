import type { GraphWorkflowConfig } from "../types";
import { upstreamNodesWithDistance } from "./upstream-walk";

function makeConfig(
  edges: { source: string; target: string }[],
): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "t" },
    nodes: {},
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
});
