/**
 * Tests for `projectGroupedConfig` (US-043 — simplified view).
 *
 * Each scenario maps a small fixture through the pure projection helper
 * and asserts the visible-nodes / visible-edges / chips / nodeToGroup
 * outputs. Keeps the helper independent of React + xyflow so we can
 * exercise the centroid + edge-rewrite math directly.
 */

import { describe, expect, it } from "vitest";
import type {
  ActivityNode,
  GraphEdge,
  GraphWorkflowConfig,
  NodeGroup,
} from "../../../types/workflow";
import {
  chipIdForGroup,
  groupIdFromChipId,
  projectGroupedConfig,
} from "./group-projection";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeActivity(
  id: string,
  position?: { x: number; y: number },
): ActivityNode {
  return {
    id,
    type: "activity",
    label: id,
    activityType: "data.transform",
    parameters: {},
    inputs: [],
    outputs: [],
    metadata: position ? { position } : undefined,
  };
}

function makeConfig(opts: {
  nodes: ActivityNode[];
  edges: GraphEdge[];
  nodeGroups?: Record<string, NodeGroup>;
}): GraphWorkflowConfig {
  const nodes: GraphWorkflowConfig["nodes"] = {};
  for (const node of opts.nodes) nodes[node.id] = node;
  return {
    schemaVersion: "1.0",
    metadata: { name: "fixture", version: "1.0.0" },
    nodes,
    edges: opts.edges,
    entryNodeId: opts.nodes[0]?.id ?? "",
    ctx: {},
    nodeGroups: opts.nodeGroups,
  };
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

describe("projectGroupedConfig", () => {
  it("returns identity (no chips, all nodes, all edges) when config has no groups", () => {
    const a = makeActivity("a", { x: 0, y: 0 });
    const b = makeActivity("b", { x: 100, y: 50 });
    const c = makeActivity("c", { x: 200, y: 100 });
    const edges: GraphEdge[] = [
      { id: "e1", source: "a", target: "b", type: "normal" },
      { id: "e2", source: "b", target: "c", type: "normal" },
    ];
    const config = makeConfig({ nodes: [a, b, c], edges });

    const result = projectGroupedConfig(config);
    expect(result.chips).toHaveLength(0);
    expect(result.visibleNodes.map((n) => n.id).sort()).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(result.visibleEdges).toEqual(edges);
    expect(result.nodeToGroup).toEqual({});
  });

  it("returns identity when nodeGroups is an empty object", () => {
    const a = makeActivity("a", { x: 0, y: 0 });
    const config = makeConfig({ nodes: [a], edges: [], nodeGroups: {} });
    const result = projectGroupedConfig(config);
    expect(result.chips).toHaveLength(0);
    expect(result.visibleNodes).toHaveLength(1);
    expect(result.nodeToGroup).toEqual({});
  });

  it("collapses each group into a chip with a stable id and computes nodeToGroup", () => {
    const n1 = makeActivity("n1", { x: 0, y: 0 });
    const n2 = makeActivity("n2", { x: 100, y: 0 });
    const n3 = makeActivity("n3", { x: 200, y: 0 });
    const n4 = makeActivity("n4", { x: 300, y: 0 });
    const config = makeConfig({
      nodes: [n1, n2, n3, n4],
      edges: [],
      nodeGroups: {
        g1: { label: "G1", nodeIds: ["n1", "n2"] },
        g2: { label: "G2", nodeIds: ["n3"] },
      },
    });
    const result = projectGroupedConfig(config);

    // Only n4 (un-grouped) remains as a normal visible node.
    expect(result.visibleNodes.map((n) => n.id)).toEqual(["n4"]);

    // Two chips, deterministic ids.
    expect(result.chips.map((c) => c.id).sort()).toEqual([
      "group-chip-g1",
      "group-chip-g2",
    ]);

    // nodeToGroup index.
    expect(result.nodeToGroup).toEqual({
      n1: "g1",
      n2: "g1",
      n3: "g2",
    });
  });

  it("computes chip centroid as the average of member positions", () => {
    const n1 = makeActivity("n1", { x: 0, y: 0 });
    const n2 = makeActivity("n2", { x: 100, y: 50 });
    const config = makeConfig({
      nodes: [n1, n2],
      edges: [],
      nodeGroups: {
        g1: { label: "G1", nodeIds: ["n1", "n2"] },
      },
    });
    const result = projectGroupedConfig(config);
    const chip = result.chips[0];
    expect(chip.position).toEqual({ x: 50, y: 25 });
    expect(chip.nodeCount).toBe(2);
    expect(chip.groupId).toBe("g1");
  });

  it("falls back to (80, 80) for members without metadata.position when computing the centroid", () => {
    // n1 has no position, n2 sits at (160, 80). Average uses the fallback
    // for n1.
    const n1 = makeActivity("n1");
    const n2 = makeActivity("n2", { x: 160, y: 80 });
    const config = makeConfig({
      nodes: [n1, n2],
      edges: [],
      nodeGroups: {
        g1: { label: "G1", nodeIds: ["n1", "n2"] },
      },
    });
    const result = projectGroupedConfig(config);
    const chip = result.chips[0];
    // (80 + 160) / 2 = 120 ; (80 + 80) / 2 = 80
    expect(chip.position).toEqual({ x: 120, y: 80 });
  });

  it("forwards chip label / icon / color from the underlying NodeGroup", () => {
    const n1 = makeActivity("n1", { x: 0, y: 0 });
    const n2 = makeActivity("n2", { x: 100, y: 0 });
    const config = makeConfig({
      nodes: [n1, n2],
      edges: [],
      nodeGroups: {
        g1: {
          label: "Cleanup",
          icon: "cleanup",
          color: "#abcdef",
          nodeIds: ["n1", "n2"],
        },
      },
    });
    const result = projectGroupedConfig(config);
    expect(result.chips[0]).toMatchObject({
      label: "Cleanup",
      icon: "cleanup",
      color: "#abcdef",
      nodeCount: 2,
    });
  });

  it("hides edges between two members of the SAME group", () => {
    const n1 = makeActivity("n1", { x: 0, y: 0 });
    const n2 = makeActivity("n2", { x: 100, y: 0 });
    const inner: GraphEdge = {
      id: "e_inner",
      source: "n1",
      target: "n2",
      type: "normal",
    };
    const config = makeConfig({
      nodes: [n1, n2],
      edges: [inner],
      nodeGroups: {
        g1: { label: "G1", nodeIds: ["n1", "n2"] },
      },
    });
    const result = projectGroupedConfig(config);
    expect(result.visibleEdges).toEqual([]);
  });

  it("rewrites an edge whose source is grouped to use the chip id (target stays)", () => {
    const n1 = makeActivity("n1", { x: 0, y: 0 });
    const n2 = makeActivity("n2", { x: 100, y: 0 });
    const ext = makeActivity("ext", { x: 200, y: 0 });
    const edge: GraphEdge = {
      id: "e1",
      source: "n2", // inside g1
      target: "ext",
      type: "normal",
    };
    const config = makeConfig({
      nodes: [n1, n2, ext],
      edges: [edge],
      nodeGroups: {
        g1: { label: "G1", nodeIds: ["n1", "n2"] },
      },
    });
    const result = projectGroupedConfig(config);
    expect(result.visibleEdges).toHaveLength(1);
    expect(result.visibleEdges[0]).toEqual({
      ...edge,
      source: "group-chip-g1",
      target: "ext",
    });
  });

  it("rewrites an edge whose target is grouped to use the chip id (source stays)", () => {
    const n1 = makeActivity("n1", { x: 0, y: 0 });
    const ext = makeActivity("ext", { x: 200, y: 0 });
    const edge: GraphEdge = {
      id: "e1",
      source: "ext",
      target: "n1", // inside g1
      type: "normal",
    };
    const config = makeConfig({
      nodes: [n1, ext],
      edges: [edge],
      nodeGroups: {
        g1: { label: "G1", nodeIds: ["n1"] },
      },
    });
    const result = projectGroupedConfig(config);
    expect(result.visibleEdges).toHaveLength(1);
    expect(result.visibleEdges[0]).toEqual({
      ...edge,
      source: "ext",
      target: "group-chip-g1",
    });
  });

  it("rewrites BOTH endpoints when an edge spans two different groups", () => {
    const n1 = makeActivity("n1", { x: 0, y: 0 });
    const n2 = makeActivity("n2", { x: 100, y: 0 });
    const n3 = makeActivity("n3", { x: 200, y: 0 });
    const edge: GraphEdge = {
      id: "e1",
      source: "n1", // in g1
      target: "n3", // in g2
      type: "normal",
    };
    const config = makeConfig({
      nodes: [n1, n2, n3],
      edges: [edge],
      nodeGroups: {
        g1: { label: "G1", nodeIds: ["n1", "n2"] },
        g2: { label: "G2", nodeIds: ["n3"] },
      },
    });
    const result = projectGroupedConfig(config);
    expect(result.visibleEdges).toHaveLength(1);
    expect(result.visibleEdges[0]).toEqual({
      ...edge,
      source: "group-chip-g1",
      target: "group-chip-g2",
    });
  });

  it("chipIdForGroup + groupIdFromChipId round-trip", () => {
    expect(chipIdForGroup("g1")).toBe("group-chip-g1");
    expect(groupIdFromChipId("group-chip-g1")).toBe("g1");
    expect(groupIdFromChipId("not-a-chip")).toBeNull();
    expect(groupIdFromChipId("group-chip-")).toBeNull();
    // group ids with dashes / underscores round-trip cleanly.
    expect(groupIdFromChipId(chipIdForGroup("group_2"))).toBe("group_2");
    expect(groupIdFromChipId(chipIdForGroup("a-b-c"))).toBe("a-b-c");
  });

  it("preserves un-grouped edges unchanged when neither endpoint is grouped", () => {
    const a = makeActivity("a", { x: 0, y: 0 });
    const b = makeActivity("b", { x: 100, y: 0 });
    const c = makeActivity("c", { x: 200, y: 0 });
    const edges: GraphEdge[] = [
      { id: "e1", source: "a", target: "b", type: "normal" },
    ];
    const config = makeConfig({
      nodes: [a, b, c],
      edges,
      nodeGroups: {
        // c is in a group but neither endpoint of the edge is.
        g1: { label: "G1", nodeIds: ["c"] },
      },
    });
    const result = projectGroupedConfig(config);
    // The single original edge survives identity-equal (same object reference
    // not required, but shape must match).
    expect(result.visibleEdges).toEqual([
      { id: "e1", source: "a", target: "b", type: "normal" },
    ]);
  });
});
