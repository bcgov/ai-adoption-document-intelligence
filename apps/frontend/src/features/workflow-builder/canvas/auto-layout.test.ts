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
import multiPageReportTemplate from "../../../../../../docs-md/workflows/templates/multi-page-report-workflow.json";
import type {
  ActivityNode,
  GraphEdge,
  GraphNode,
  GraphWorkflowConfig,
  MapNode,
  SwitchNode,
} from "../../../types/workflow";
import {
  configHasAnyPosition,
  layoutGraph,
  layoutGraphIfMissingPositions,
  layoutGraphSimplified,
  layoutGraphWithMapBodies,
} from "./auto-layout";
import { chipIdForGroup, projectGroupedConfig } from "./group-projection";
import { estimateNodeHeight } from "./port-rows";

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

function buildActivityOfType(id: string, activityType: string): ActivityNode {
  return {
    id,
    type: "activity",
    label: id,
    activityType,
    inputs: [],
    outputs: [],
    parameters: {},
  };
}

function buildSwitch(id: string): SwitchNode {
  return {
    id,
    type: "switch",
    label: id,
    cases: [],
  };
}

/**
 * A tall (`azureOcr.extract`, 5 input rows) and a zero-row (`switch`) node
 * both hang directly off `root` with no edge between them, so dagre's
 * network-simplex ranker settles both at rank 1 — same rank, real height
 * mismatch. Exercises the per-node-height auto-layout path (Task 9).
 */
function buildTallShortConfig(): GraphWorkflowConfig {
  const nodes: Record<string, ActivityNode | SwitchNode> = {
    root: buildActivityOfType("root", "data.transform"),
    tall: buildActivityOfType("tall", "azureOcr.extract"),
    short: buildSwitch("short"),
  };
  const edges: GraphEdge[] = [
    { id: "e1", source: "root", target: "tall", type: "normal" },
    { id: "e2", source: "root", target: "short", type: "normal" },
  ];
  return {
    schemaVersion: "1.0",
    metadata: { name: "tall-short" },
    nodes,
    edges,
    entryNodeId: "root",
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
// Task 9 — per-node heights (real port-row counts, not the fixed default).
// ---------------------------------------------------------------------------

describe("layoutGraph — Task 9: per-node heights avoid same-rank overlap", () => {
  it("separates a tall (5-row) node from a same-rank zero-row node by at least its real height", () => {
    const cfg = buildTallShortConfig();
    const out = layoutGraph(cfg, { rankdir: "LR" });

    const tallY = (
      out.nodes.tall.metadata as { position: { x: number; y: number } }
    ).position.y;
    const shortY = (
      out.nodes.short.metadata as { position: { x: number; y: number } }
    ).position.y;
    const tallX = (
      out.nodes.tall.metadata as { position: { x: number; y: number } }
    ).position.x;
    const shortX = (
      out.nodes.short.metadata as { position: { x: number; y: number } }
    ).position.x;

    // Same rank in an LR layout — same column (x), separated vertically (y).
    expect(tallX).toBeCloseTo(shortX, 5);

    const tallHeight = estimateNodeHeight(cfg, "tall");
    const shortHeight = estimateNodeHeight(cfg, "short");
    expect(tallHeight).toBeGreaterThan(shortHeight);

    // `position` is top-left, so this is exact edge-to-edge non-overlap
    // regardless of x/y unit conventions.
    const tallTop = tallY;
    const tallBottom = tallY + tallHeight;
    const shortTop = shortY;
    const shortBottom = shortY + shortHeight;
    const noOverlap = tallBottom <= shortTop || shortBottom <= tallTop;
    expect(noOverlap).toBe(true);

    // Old fixed-80 layout would have given both nodes identical height,
    // so same-rank centers would land exactly `nodesep(60) + 80 = 140`
    // apart. The calibrated per-node heights (tall activity = 293, switch
    // diamond = 180) push the centers further apart than that fixed
    // baseline — proof the positions differ from the old code's output.
    const centerGap = Math.abs(
      tallY + tallHeight / 2 - (shortY + shortHeight / 2),
    );
    const oldFixedCenterGap = 60 + 80; // nodesep + DEFAULT_NODE_HEIGHT
    expect(centerGap).toBeGreaterThan(oldFixedCenterGap);
  });
});

// ---------------------------------------------------------------------------
// Per-node measured widths — "Auto-arrange" horizontal packing.
// ---------------------------------------------------------------------------

describe("layoutGraph — per-node measured widths pack columns tighter", () => {
  const NARROW = 200;
  // DEFAULT_NODE_WIDTH in auto-layout.ts. Hard-coded on purpose: if that
  // constant moves, the fallback-spacing expectation below should fail loudly.
  const DEFAULT_WIDTH = 482;

  function xOf(config: GraphWorkflowConfig, id: string): number {
    return (config.nodes[id].metadata as { position: { x: number } }).position
      .x;
  }

  it("spaces adjacent columns by suppliedWidth + ranksep, not the fixed default", () => {
    const config = buildLinearConfig();
    const nodeWidths = new Map([
      ["a", NARROW],
      ["b", NARROW],
      ["c", NARROW],
    ]);
    const out = layoutGraph(config, { rankdir: "LR", ranksep: 80, nodeWidths });
    // Equal widths ⇒ top-left delta === centre-to-centre delta ===
    // w/2 + ranksep + w/2 === NARROW + ranksep.
    expect(xOf(out, "b") - xOf(out, "a")).toBeCloseTo(NARROW + 80, 0);
    expect(xOf(out, "c") - xOf(out, "b")).toBeCloseTo(NARROW + 80, 0);
  });

  it("is tighter than the default fixed-width layout for the same graph", () => {
    const config = buildLinearConfig();
    const nodeWidths = new Map([
      ["a", NARROW],
      ["b", NARROW],
      ["c", NARROW],
    ]);
    const packed = layoutGraph(config, { rankdir: "LR", nodeWidths });
    const fixed = layoutGraph(config, { rankdir: "LR" });
    expect(xOf(packed, "b") - xOf(packed, "a")).toBeLessThan(
      xOf(fixed, "b") - xOf(fixed, "a"),
    );
  });

  it("falls back to the default width for node ids absent from the map", () => {
    const config = buildLinearConfig();
    // Only 'b' is measured narrow; 'a' and 'c' keep the default footprint.
    const nodeWidths = new Map([["b", NARROW]]);
    const out = layoutGraph(config, { rankdir: "LR", ranksep: 80, nodeWidths });
    // Centre = top-left + width/2, using each node's effective width.
    const centre = (id: string, width: number) => xOf(out, id) + width / 2;
    // a(default) → b(narrow): default/2 + ranksep + narrow/2.
    expect(centre("b", NARROW) - centre("a", DEFAULT_WIDTH)).toBeCloseTo(
      DEFAULT_WIDTH / 2 + 80 + NARROW / 2,
      0,
    );
    // b(narrow) → c(default): narrow/2 + ranksep + default/2 (symmetric).
    expect(centre("c", DEFAULT_WIDTH) - centre("b", NARROW)).toBeCloseTo(
      NARROW / 2 + 80 + DEFAULT_WIDTH / 2,
      0,
    );
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

// ---------------------------------------------------------------------------
// layoutGraphWithMapBodies — clusters a map's body members under dagre (so the
// derived body-container box wraps just its members) and strips the synthetic
// groups back out so they never persist. Regression for the arrange-on-load
// bug where a map's body scattered because the synthetic groups never reached
// the layout.
// ---------------------------------------------------------------------------

function buildMapBodyConfig(): GraphWorkflowConfig {
  const map: MapNode = {
    id: "m",
    type: "map",
    label: "Run for each",
    collectionCtxKey: "items",
    itemCtxKey: "item",
    bodyEntryNodeId: "b1",
    bodyExitNodeId: "b2",
  };
  const nodes: Record<string, GraphNode> = {
    m: map,
    b1: buildActivity("b1"),
    b2: buildActivity("b2"),
    outside: buildActivity("outside"),
  };
  const edges: GraphEdge[] = [
    { id: "e1", source: "m", target: "b1", type: "normal" },
    { id: "e2", source: "b1", target: "b2", type: "normal" },
    { id: "e3", source: "b2", target: "outside", type: "normal" },
  ];
  return {
    schemaVersion: "1.0",
    metadata: { name: "map-body" },
    nodes,
    edges,
    entryNodeId: "m",
    ctx: {},
  };
}

// ---------------------------------------------------------------------------
// G-4 — layoutGraphSimplified: arrange the graph the author is LOOKING at.
// Chips sit at their members' centroid, so laying out the member graph moved
// each chip to the middle of its own member chain and nothing visible moved.
// ---------------------------------------------------------------------------

/** DEFAULT_GROUP_CHIP_WIDTH / GROUP_CHIP_HEIGHT in auto-layout.ts. Hard-coded
 *  on purpose: if a constant moves, the spacing expectations below fail loudly. */
const CHIP_WIDTH = 248;
const CHIP_HEIGHT = 48;

function positionOf(
  config: GraphWorkflowConfig,
  id: string,
): { x: number; y: number } {
  return (config.nodes[id].metadata as { position: { x: number; y: number } })
    .position;
}

/**
 * W-1 — where a node sits in the SIMPLIFIED view, which keeps an arrangement
 * of its own. `layoutGraphSimplified` writes here and never to `position`.
 */
function simplifiedPositionOf(
  config: GraphWorkflowConfig,
  id: string,
): { x: number; y: number } {
  return (
    config.nodes[id].metadata as {
      simplifiedPosition: { x: number; y: number };
    }
  ).simplifiedPosition;
}

function chipPositions(
  config: GraphWorkflowConfig,
): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  for (const chip of projectGroupedConfig(config).chips) {
    out[chip.groupId] = chip.position;
  }
  return out;
}

function placed(id: string, x: number, y: number): ActivityNode {
  return buildActivity(id, { position: { x, y } });
}

/**
 * Two groups and one ungrouped node, wired g1 → g2 → outside. Every node
 * starts stacked around the origin, so the two chips start on top of each
 * other — the state Auto-arrange is asked to fix. Each group's members carry
 * a distinct internal offset so a re-layout (rather than a translation) is
 * detectable.
 */
function buildSimplifiedConfig(): GraphWorkflowConfig {
  const nodes: Record<string, ActivityNode> = {
    n1: placed("n1", 0, 0),
    n2: placed("n2", 100, 40),
    n3: placed("n3", 10, 10),
    n4: placed("n4", 130, -20),
    outside: placed("outside", 60, 5),
  };
  const edges: GraphEdge[] = [
    { id: "e1", source: "n1", target: "n2", type: "normal" },
    { id: "e2", source: "n2", target: "n3", type: "normal" },
    { id: "e3", source: "n3", target: "n4", type: "normal" },
    { id: "e4", source: "n4", target: "outside", type: "normal" },
  ];
  return {
    schemaVersion: "1.0",
    metadata: { name: "simplified" },
    nodes,
    edges,
    entryNodeId: "n1",
    ctx: {},
    nodeGroups: {
      g1: { label: "G1", nodeIds: ["n1", "n2"] },
      g2: { label: "G2", nodeIds: ["n3", "n4"] },
    },
  };
}

describe("layoutGraphSimplified — G-4 / W-1: lays out chips into the simplified view's own geometry", () => {
  it("spaces the chips as CHIP columns, not as member-chain centroids", () => {
    const config = buildSimplifiedConfig();
    const before = chipPositions(config);
    // The fixture's whole point: the two chips overlap before the arrange.
    expect(Math.abs(before.g2.x - before.g1.x)).toBeLessThan(CHIP_WIDTH);

    const out = layoutGraphSimplified(config, { rankdir: "LR", ranksep: 80 });
    const after = chipPositions(out);

    // g1 → g2 is an edge, so LR puts g1's chip in the earlier column — one
    // chip box plus one ranksep away (equal widths ⇒ top-left delta ===
    // centre delta). `layoutGraphWithMapBodies` on the same config leaves the
    // chips ~4x further apart, at member-column scale, which is the bug: the
    // spacing described the members' chains, not the graph on screen.
    expect(after.g2.x - after.g1.x).toBeCloseTo(CHIP_WIDTH + 80, 0);
    // Ungrouped `outside` hangs off g2 and lands in a later column still.
    expect(simplifiedPositionOf(out, "outside").x).toBeGreaterThan(
      after.g2.x + CHIP_WIDTH,
    );
  });

  // W-1 — the reported defect: arranging in this view must not reach the
  // expanded canvas. Both halves matter, so both are asserted separately: the
  // members keep their authored positions, and the chip placement is stored
  // where the simplified view can read it back.
  it("leaves every member's EXPANDED position untouched", () => {
    const config = buildSimplifiedConfig();
    const out = layoutGraphSimplified(config, { rankdir: "LR" });
    for (const id of ["n1", "n2", "n3", "n4"]) {
      expect(positionOf(out, id)).toEqual(positionOf(config, id));
    }
  });

  it("leaves an UNGROUPED node's expanded position untouched too", () => {
    const config = buildSimplifiedConfig();
    const out = layoutGraphSimplified(config, { rankdir: "LR" });
    expect(positionOf(out, "outside")).toEqual(positionOf(config, "outside"));
    // ...while giving it a simplified placement of its own.
    expect(simplifiedPositionOf(out, "outside")).not.toEqual(
      positionOf(config, "outside"),
    );
  });

  it("stores each chip's placement on its group", () => {
    const config = buildSimplifiedConfig();
    const out = layoutGraphSimplified(config, { rankdir: "LR" });
    const after = chipPositions(out);
    for (const groupId of ["g1", "g2"]) {
      expect(out.nodeGroups?.[groupId].position).toEqual(after[groupId]);
    }
    // The projection reads that stored position back rather than re-deriving a
    // centroid, which is what makes the arrangement survive a reload.
    expect(after.g1).not.toEqual(chipPositions(config).g1);
  });

  it("does not move members with their chip", () => {
    const config = buildSimplifiedConfig();
    const out = layoutGraphSimplified(config, { rankdir: "LR" });
    const before = chipPositions(config);
    const after = chipPositions(out);

    for (const [groupId, members] of Object.entries({
      g1: ["n1", "n2"],
      g2: ["n3", "n4"],
    })) {
      const dx = after[groupId].x - before[groupId].x;
      // The fixture's chips really do travel, so "members didn't move" is a
      // meaningful assertion rather than a vacuous one.
      expect(Math.abs(dx)).toBeGreaterThan(0);
      for (const id of members) {
        expect(positionOf(out, id)).toEqual(positionOf(config, id));
      }
    }
  });

  it("keeps each group's INTERNAL member geometry, since members never move", () => {
    const config = buildSimplifiedConfig();
    const out = layoutGraphSimplified(config, { rankdir: "LR" });

    for (const [a, b] of [
      ["n1", "n2"],
      ["n3", "n4"],
    ]) {
      const beforeOffset = {
        x: positionOf(config, b).x - positionOf(config, a).x,
        y: positionOf(config, b).y - positionOf(config, a).y,
      };
      const afterOffset = {
        x: positionOf(out, b).x - positionOf(out, a).x,
        y: positionOf(out, b).y - positionOf(out, a).y,
      };
      expect(afterOffset).toEqual(beforeOffset);
    }
  });

  it("uses the caller's MEASURED chip width, as it does for cards", () => {
    const config = buildSimplifiedConfig();
    const WIDE = 600;
    const nodeWidths = new Map([
      [chipIdForGroup("g1"), WIDE],
      [chipIdForGroup("g2"), WIDE],
    ]);
    const measured = chipPositions(
      layoutGraphSimplified(config, { rankdir: "LR", ranksep: 80, nodeWidths }),
    );
    const fallback = chipPositions(
      layoutGraphSimplified(config, { rankdir: "LR", ranksep: 80 }),
    );
    // Equal widths ⇒ column delta === width + ranksep, so a wider measured
    // chip pushes the next column further right by exactly the width delta.
    expect(measured.g2.x - measured.g1.x).toBeCloseTo(WIDE + 80, 0);
    expect(fallback.g2.x - fallback.g1.x).toBeCloseTo(CHIP_WIDTH + 80, 0);
  });

  it("does not overlap a chip with an ungrouped node on the same rank", () => {
    // `solo` hangs off the same producer as g2's chip, so dagre ranks them
    // together — the chip's height has to be reserved or they collide.
    const config = buildSimplifiedConfig();
    const withSibling: GraphWorkflowConfig = {
      ...config,
      nodes: { ...config.nodes, solo: placed("solo", 0, 0) },
      edges: [
        ...config.edges,
        { id: "e5", source: "n2", target: "solo", type: "normal" },
      ],
    };
    const out = layoutGraphSimplified(withSibling, { rankdir: "LR" });
    const chipY = chipPositions(out).g2.y;
    const soloY = simplifiedPositionOf(out, "solo").y;
    const soloHeight = estimateNodeHeight(withSibling, "solo");
    const noOverlap =
      chipY + CHIP_HEIGHT <= soloY || soloY + soloHeight <= chipY;
    expect(noOverlap).toBe(true);
  });

  it("is pure — the input config and its nodes are untouched", () => {
    const config = buildSimplifiedConfig();
    const snapshot = JSON.parse(JSON.stringify(config)) as GraphWorkflowConfig;
    const out = layoutGraphSimplified(config);
    expect(config).toEqual(snapshot);
    expect(out.nodes).not.toBe(config.nodes);
    // W-1 — `nodeGroups` now carries the chips' placement, so it is a fresh
    // object rather than the input's. Everything else about each group is
    // preserved exactly.
    expect(out.nodeGroups).not.toBe(config.nodeGroups);
    for (const [groupId, group] of Object.entries(out.nodeGroups ?? {})) {
      const { position: _placement, ...rest } = group;
      expect(rest).toEqual(config.nodeGroups?.[groupId]);
    }
  });

  it("still writes only simplified geometry when nothing is collapsed", () => {
    // W-1 — with no groups the two views show the same graph, but they are
    // still two arrangements. Arranging here must not rewrite the expanded
    // one, or the defect returns for every ungrouped workflow.
    const linear = buildLinearConfig();
    const out = layoutGraphSimplified(linear);
    const expandedPositionOf = (c: GraphWorkflowConfig, id: string) =>
      (
        c.nodes[id].metadata as
          | { position?: { x: number; y: number } }
          | undefined
      )?.position;
    for (const id of Object.keys(linear.nodes)) {
      expect(expandedPositionOf(out, id)).toEqual(
        expandedPositionOf(linear, id),
      );
      expect(simplifiedPositionOf(out, id)).toBeDefined();
    }
    // The placement itself matches what the expanded layout would produce —
    // same graph, same dagre pass, only a different field.
    const expanded = layoutGraphWithMapBodies(linear);
    for (const id of Object.keys(linear.nodes)) {
      expect(simplifiedPositionOf(out, id)).toEqual(positionOf(expanded, id));
    }
  });

  it("lays out a config where no node has been placed yet", () => {
    // Every chip reads the same centroid fallback, so they all start stacked
    // on one point — dagre still has edges to work from and must separate them.
    const config = buildSimplifiedConfig();
    const unplaced: GraphWorkflowConfig = {
      ...config,
      nodes: Object.fromEntries(
        Object.entries(config.nodes).map(([id, node]) => [
          id,
          { ...node, metadata: undefined },
        ]),
      ),
    };
    const after = chipPositions(layoutGraphSimplified(unplaced));
    expect(after.g2.x - after.g1.x).toBeGreaterThan(CHIP_WIDTH);
  });

  it("keeps a visible map body clustered while groups are collapsed", () => {
    // A map whose body is NOT inside any user group stays a cluster in the
    // projected layout, exactly as it does in the expanded one.
    const map: MapNode = {
      id: "m",
      type: "map",
      label: "Run for each",
      collectionCtxKey: "items",
      itemCtxKey: "item",
      bodyEntryNodeId: "b1",
      bodyExitNodeId: "b2",
    };
    const nodes: Record<string, GraphNode> = {
      g1a: placed("g1a", 0, 0),
      g1b: placed("g1b", 90, 0),
      m: { ...map, metadata: { position: { x: 200, y: 0 } } } as MapNode,
      b1: placed("b1", 300, 0),
      b2: placed("b2", 400, 0),
      tail: placed("tail", 500, 0),
    };
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "simplified-map" },
      nodes,
      edges: [
        { id: "e1", source: "g1a", target: "g1b", type: "normal" },
        { id: "e2", source: "g1b", target: "m", type: "normal" },
        { id: "e3", source: "m", target: "b1", type: "normal" },
        { id: "e4", source: "b1", target: "b2", type: "normal" },
        { id: "e5", source: "b2", target: "tail", type: "normal" },
      ],
      entryNodeId: "g1a",
      ctx: {},
      nodeGroups: { g1: { label: "G1", nodeIds: ["g1a", "g1b"] } },
    };

    const out = layoutGraphSimplified(config, { rankdir: "LR" });
    // The body members cluster: they sit closer to each other than the
    // non-member `tail` sits to either of them.
    const b1 = simplifiedPositionOf(out, "b1");
    const b2 = simplifiedPositionOf(out, "b2");
    const tail = simplifiedPositionOf(out, "tail");
    const bodySpan = Math.hypot(b2.x - b1.x, b2.y - b1.y);
    expect(Math.hypot(tail.x - b2.x, tail.y - b2.y)).toBeGreaterThan(bodySpan);
    // ...and the synthetic group never lands in the persisted config.
    expect(
      Object.keys(out.nodeGroups ?? {}).some((k) =>
        k.startsWith("__map_body_"),
      ),
    ).toBe(false);
  });
});

describe("layoutGraphWithMapBodies — clusters map bodies, strips synthetic groups", () => {
  it("does not persist synthetic map-body groups in the output", () => {
    const out = layoutGraphWithMapBodies(buildMapBodyConfig());
    const keys = Object.keys(out.nodeGroups ?? {});
    expect(keys.some((k) => k.startsWith("__map_body_"))).toBe(false);
  });

  it("feeds the synthetic map-body cluster to dagre — layout differs from the un-clustered layoutGraph", () => {
    const config = buildMapBodyConfig();
    const clustered = layoutGraphWithMapBodies(config);
    const plain = layoutGraph(config);
    const pos = (c: GraphWorkflowConfig, id: string) =>
      (c.nodes[id].metadata as { position: { x: number; y: number } }).position;
    const differs = ["m", "b1", "b2", "outside"].some((id) => {
      const a = pos(clustered, id);
      const b = pos(plain, id);
      return a.x !== b.x || a.y !== b.y;
    });
    expect(differs).toBe(true);
  });

  it("is a no-op wrapper when the config has no map body", () => {
    const linear = buildLinearConfig();
    expect(layoutGraphWithMapBodies(linear)).toEqual(layoutGraph(linear));
  });
});
