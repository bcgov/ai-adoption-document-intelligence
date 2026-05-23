/**
 * Tests for the `auto-layout` helper used by the visual workflow editor
 * and the read-only renderer.
 *
 * Each test maps to one acceptance scenario from
 * feature-docs/20260525-workflow-builder-phase1b-completion/user_stories/
 * US-049-auto-layout-helper.md and US-050-auto-layout-on-template-load.md.
 */

import { describe, expect, it } from "vitest";
// Fixture: the multi-page report template ships 5 node groups (Scenario 4).
import multiPageReportTemplate from "../../../../../../docs-md/graph-workflows/templates/multi-page-report-workflow.json";
import type {
  ActivityNode,
  GraphEdge,
  GraphWorkflowConfig,
} from "../../../types/workflow";
import {
  configHasAnyPosition,
  layoutGraph,
  layoutGraphIfMissingPositions,
} from "./auto-layout";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function buildActivity(
  id: string,
  positionedMeta?: { position: { x: number; y: number } },
): ActivityNode {
  return {
    id,
    type: "activity",
    label: id,
    activityType: "data.transform",
    inputs: [],
    outputs: [],
    parameters: {},
    metadata: positionedMeta,
  };
}

function buildLinearConfig(): GraphWorkflowConfig {
  const nodes: Record<string, ActivityNode> = {
    a: buildActivity("a"),
    b: buildActivity("b"),
    c: buildActivity("c"),
  };
  const edges: GraphEdge[] = [
    { id: "e1", source: "a", target: "b", type: "normal" },
    { id: "e2", source: "b", target: "c", type: "normal" },
  ];
  return {
    schemaVersion: "1.0",
    metadata: { name: "linear" },
    nodes,
    edges,
    entryNodeId: "a",
    ctx: {},
  };
}

function buildGroupedConfig(): GraphWorkflowConfig {
  const nodes: Record<string, ActivityNode> = {
    n1: buildActivity("n1"),
    n2: buildActivity("n2"),
    n3: buildActivity("n3"),
    outside: buildActivity("outside"),
  };
  const edges: GraphEdge[] = [
    { id: "e1", source: "n1", target: "n2", type: "normal" },
    { id: "e2", source: "n2", target: "n3", type: "normal" },
    { id: "e3", source: "n3", target: "outside", type: "normal" },
  ];
  return {
    schemaVersion: "1.0",
    metadata: { name: "grouped" },
    nodes,
    edges,
    entryNodeId: "n1",
    ctx: {},
    nodeGroups: {
      g1: {
        label: "G1",
        nodeIds: ["n1", "n2", "n3"],
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Scenario 1 — layoutGraph stamps positions on every node, is pure, and
// honours edge source/target.
// ---------------------------------------------------------------------------

describe("layoutGraph — Scenario 1: stamps positions on every node", () => {
  it("returns a new config with every node carrying a metadata.position", () => {
    const config = buildLinearConfig();
    const out = layoutGraph(config);
    for (const node of Object.values(out.nodes)) {
      const pos = (node.metadata as { position?: { x: number; y: number } })
        ?.position;
      expect(pos).toBeDefined();
      expect(typeof pos?.x).toBe("number");
      expect(typeof pos?.y).toBe("number");
    }
  });

  it("is pure — the original config and its nodes are not mutated", () => {
    const config = buildLinearConfig();
    const snapshot = JSON.parse(JSON.stringify(config)) as GraphWorkflowConfig;
    layoutGraph(config);
    expect(config).toEqual(snapshot);
    for (const node of Object.values(config.nodes)) {
      expect(node.metadata).toBeUndefined();
    }
  });

  it("returns a structurally new config object (referential inequality)", () => {
    const config = buildLinearConfig();
    const out = layoutGraph(config);
    expect(out).not.toBe(config);
    expect(out.nodes).not.toBe(config.nodes);
    expect(out.nodes.a).not.toBe(config.nodes.a);
  });

  it("honours edge source/target — a → b → c lays out left-to-right", () => {
    const config = buildLinearConfig();
    const out = layoutGraph(config, { rankdir: "LR" });
    const ax = (out.nodes.a.metadata as { position: { x: number; y: number } })
      .position.x;
    const bx = (out.nodes.b.metadata as { position: { x: number; y: number } })
      .position.x;
    const cx = (out.nodes.c.metadata as { position: { x: number; y: number } })
      .position.x;
    expect(bx).toBeGreaterThan(ax);
    expect(cx).toBeGreaterThan(bx);
  });

  it("rankdir TB lays out top-to-bottom (y-progression)", () => {
    const config = buildLinearConfig();
    const out = layoutGraph(config, { rankdir: "TB" });
    const ay = (out.nodes.a.metadata as { position: { x: number; y: number } })
      .position.y;
    const by = (out.nodes.b.metadata as { position: { x: number; y: number } })
      .position.y;
    const cy = (out.nodes.c.metadata as { position: { x: number; y: number } })
      .position.y;
    expect(by).toBeGreaterThan(ay);
    expect(cy).toBeGreaterThan(by);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4 — Compound graph: group members cluster together.
// ---------------------------------------------------------------------------

describe("layoutGraph — Scenario 4: group sub-graphs cluster as compound nodes", () => {
  it("places members of the same group spatially close", () => {
    const config = buildGroupedConfig();
    const out = layoutGraph(config, { rankdir: "LR" });
    const positions: Record<string, { x: number; y: number }> = {};
    for (const node of Object.values(out.nodes)) {
      const pos = (node.metadata as { position: { x: number; y: number } })
        .position;
      positions[node.id] = pos;
    }

    // The group {n1,n2,n3} should be tighter (max-pairwise-distance) than the
    // gap to the ungrouped `outside` node from the group's centroid.
    const groupIds = ["n1", "n2", "n3"];
    const groupPositions = groupIds.map((id) => positions[id]);
    const centroid = {
      x: groupPositions.reduce((s, p) => s + p.x, 0) / groupPositions.length,
      y: groupPositions.reduce((s, p) => s + p.y, 0) / groupPositions.length,
    };
    const outsideDist = Math.hypot(
      positions.outside.x - centroid.x,
      positions.outside.y - centroid.y,
    );
    const maxIntraDist = Math.max(
      ...groupPositions.map((p) =>
        Math.hypot(p.x - centroid.x, p.y - centroid.y),
      ),
    );
    expect(outsideDist).toBeGreaterThan(maxIntraDist);
  });

  it("preserves all groups on the output config", () => {
    const config = buildGroupedConfig();
    const out = layoutGraph(config);
    expect(out.nodeGroups).toBeDefined();
    expect(out.nodeGroups?.g1).toBeDefined();
    expect(out.nodeGroups?.g1.nodeIds).toEqual(["n1", "n2", "n3"]);
  });

  it("works against the multi-page-report template (5 groups)", () => {
    const template = multiPageReportTemplate as unknown as GraphWorkflowConfig;
    const out = layoutGraph(template);
    // Every node has a position
    for (const node of Object.values(out.nodes)) {
      const pos = (node.metadata as { position?: { x: number; y: number } })
        ?.position;
      expect(pos).toBeDefined();
    }
    expect(out.nodeGroups).toBeDefined();
    expect(Object.keys(out.nodeGroups ?? {})).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// US-050 — Detection helpers.
// ---------------------------------------------------------------------------

describe("configHasAnyPosition — detection helper", () => {
  it("returns false when no node has a metadata.position", () => {
    expect(configHasAnyPosition(buildLinearConfig())).toBe(false);
  });

  it("returns true when at least one node has a position", () => {
    const config = buildLinearConfig();
    const withPos: GraphWorkflowConfig = {
      ...config,
      nodes: {
        ...config.nodes,
        a: {
          ...config.nodes.a,
          metadata: { position: { x: 10, y: 20 } },
        } as ActivityNode,
      },
    };
    expect(configHasAnyPosition(withPos)).toBe(true);
  });

  it("returns false for a config with no nodes", () => {
    expect(
      configHasAnyPosition({
        schemaVersion: "1.0",
        metadata: {},
        nodes: {},
        edges: [],
        entryNodeId: "",
        ctx: {},
      }),
    ).toBe(false);
  });
});

describe("layoutGraphIfMissingPositions — US-050", () => {
  it("Scenario 1: runs layoutGraph when no nodes have positions", () => {
    const config = buildLinearConfig();
    const out = layoutGraphIfMissingPositions(config);
    for (const node of Object.values(out.nodes)) {
      const pos = (node.metadata as { position?: { x: number; y: number } })
        ?.position;
      expect(pos).toBeDefined();
    }
  });

  it("Scenario 2: returns the original config when ALL nodes have positions", () => {
    const config = buildLinearConfig();
    const positioned: GraphWorkflowConfig = {
      ...config,
      nodes: {
        a: { ...config.nodes.a, metadata: { position: { x: 1, y: 2 } } },
        b: { ...config.nodes.b, metadata: { position: { x: 3, y: 4 } } },
        c: { ...config.nodes.c, metadata: { position: { x: 5, y: 6 } } },
      },
    };
    const out = layoutGraphIfMissingPositions(positioned);
    expect(out).toBe(positioned);
    expect(
      (out.nodes.a.metadata as { position: { x: number; y: number } }).position,
    ).toEqual({ x: 1, y: 2 });
  });

  it("Scenario 3: partial positions are preserved — no re-layout", () => {
    const config = buildLinearConfig();
    const partial: GraphWorkflowConfig = {
      ...config,
      nodes: {
        ...config.nodes,
        a: {
          ...config.nodes.a,
          metadata: { position: { x: 999, y: 999 } },
        } as ActivityNode,
        // b and c remain unpositioned
      },
    };
    const out = layoutGraphIfMissingPositions(partial);
    expect(out).toBe(partial);
    expect(
      (out.nodes.a.metadata as { position: { x: number; y: number } }).position,
    ).toEqual({ x: 999, y: 999 });
    expect(out.nodes.b.metadata).toBeUndefined();
  });
});
