import { describe, expect, it } from "vitest";
import type {
  GraphEdge,
  GraphNode,
  GraphWorkflowConfig,
} from "../../../../types/workflow";
import { analyzeMapBody, nodesReachableFrom } from "./map-body-analysis";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function node(id: string): GraphNode {
  return { id, type: "activity", label: id, activityType: "test.noop" };
}

function makeConfig(
  nodeIds: string[],
  edges: Array<[string, string]>,
): GraphWorkflowConfig {
  const nodes: Record<string, GraphNode> = {};
  for (const id of nodeIds) nodes[id] = node(id);
  const graphEdges: GraphEdge[] = edges.map(([source, target], i) => ({
    id: `e${i}`,
    source,
    target,
    type: "normal",
  }));
  return {
    schemaVersion: "1.0",
    metadata: {},
    entryNodeId: nodeIds[0] ?? "",
    nodes,
    edges: graphEdges,
    ctx: {},
  };
}

// ---------------------------------------------------------------------------
// analyzeMapBody
// ---------------------------------------------------------------------------

describe("analyzeMapBody", () => {
  it("is not computed until both entry and exit exist", () => {
    const config = makeConfig(["a", "b"], [["a", "b"]]);
    expect(analyzeMapBody(config, undefined, "b").computed).toBe(false);
    expect(analyzeMapBody(config, "a", undefined).computed).toBe(false);
    expect(analyzeMapBody(config, "a", "missing").computed).toBe(false);
  });

  it("a linear body (entry → A → exit) has no dead-ends and a reachable exit", () => {
    const config = makeConfig(
      ["entry", "a", "exit"],
      [
        ["entry", "a"],
        ["a", "exit"],
      ],
    );
    const result = analyzeMapBody(config, "entry", "exit");
    expect(result.computed).toBe(true);
    expect(result.exitReachable).toBe(true);
    expect(result.deadEndNodeIds).toEqual([]);
  });

  it("a single-node body (entry === exit) is valid", () => {
    const config = makeConfig(["only"], []);
    const result = analyzeMapBody(config, "only", "only");
    expect(result.exitReachable).toBe(true);
    expect(result.deadEndNodeIds).toEqual([]);
  });

  it("flags branches that never reach the exit as dead-ends", () => {
    // switch fans to three leaves; only `recv` reaches the exit `poll`.
    const config = makeConfig(
      ["sw", "child", "poll", "approve"],
      [
        ["sw", "child"],
        ["sw", "poll"],
        ["sw", "approve"],
      ],
    );
    const result = analyzeMapBody(config, "sw", "poll");
    expect(result.exitReachable).toBe(true);
    // `child` and `approve` terminate without reaching `poll`.
    expect(result.deadEndNodeIds.sort()).toEqual(["approve", "child"]);
  });

  it("reports the exit as unreachable when no path leads to it", () => {
    const config = makeConfig(
      ["entry", "a", "exit"],
      [["entry", "a"]], // nothing leads to exit
    );
    const result = analyzeMapBody(config, "entry", "exit");
    expect(result.exitReachable).toBe(false);
    // `entry` reaches `a` (a body node), so only `a` — which reaches nothing —
    // is a dead-end. The unreachable exit is the primary signal here.
    expect(result.deadEndNodeIds.sort()).toEqual(["a"]);
  });

  it("a body that reconverges to the exit has no dead-ends", () => {
    // switch → two branches that both merge back into the exit.
    const config = makeConfig(
      ["sw", "left", "right", "merge"],
      [
        ["sw", "left"],
        ["sw", "right"],
        ["left", "merge"],
        ["right", "merge"],
      ],
    );
    const result = analyzeMapBody(config, "sw", "merge");
    expect(result.exitReachable).toBe(true);
    expect(result.deadEndNodeIds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// nodesReachableFrom
// ---------------------------------------------------------------------------

describe("nodesReachableFrom", () => {
  it("returns the entry plus everything downstream", () => {
    const config = makeConfig(
      ["sw", "child", "poll", "approve", "collect"],
      [
        ["sw", "child"],
        ["sw", "poll"],
        ["sw", "approve"],
      ],
    );
    const reachable = nodesReachableFrom(config, "sw");
    expect([...reachable].sort()).toEqual(["approve", "child", "poll", "sw"]);
    // `collect` is not reachable from the switch and is excluded.
    expect(reachable.has("collect")).toBe(false);
  });

  it("returns an empty set when the entry is unset or missing", () => {
    const config = makeConfig(["a"], []);
    expect(nodesReachableFrom(config, undefined).size).toBe(0);
    expect(nodesReachableFrom(config, "missing").size).toBe(0);
  });
});
