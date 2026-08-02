/**
 * Group move-together (UX walkthrough item 6, 2026-08-02).
 *
 * The rule under test: a drag carries the rest of the author's group, and
 * nothing else. Synthetic map-body groups, deleted members and nodes xyflow
 * is already moving are each excluded for a different reason — see the
 * individual cases.
 */

import { describe, expect, it } from "vitest";
import type { GraphWorkflowConfig } from "../../../types/workflow";
import {
  applyGroupDragDelta,
  captureGroupDragCohort,
  resolveGroupDragExtras,
  userGroupMembersOf,
} from "./group-drag-cohesion";

function makeConfig(
  positions: Record<string, { x: number; y: number } | null>,
  nodeGroups: GraphWorkflowConfig["nodeGroups"] = {},
): GraphWorkflowConfig {
  const nodes: GraphWorkflowConfig["nodes"] = {};
  for (const [id, position] of Object.entries(positions)) {
    nodes[id] = {
      id,
      type: "activity",
      label: id,
      activityType: "file.prepare",
      ...(position ? { metadata: { position } } : {}),
    } as GraphWorkflowConfig["nodes"][string];
  }
  return {
    schemaVersion: "1.0",
    metadata: { name: "t" },
    nodes,
    edges: [],
    entryNodeId: Object.keys(nodes)[0] ?? "",
    ctx: {},
    nodeGroups,
  };
}

const groupOf = (...nodeIds: string[]) => ({ label: "Stage one", nodeIds });

describe("userGroupMembersOf", () => {
  it("returns the members of the author group a node belongs to", () => {
    const cfg = makeConfig(
      { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } },
      { g1: groupOf("a", "b") },
    );
    expect(userGroupMembersOf(cfg, "a")).toEqual(["a", "b"]);
  });

  it("returns null for an ungrouped node", () => {
    const cfg = makeConfig({ a: { x: 0, y: 0 } });
    expect(userGroupMembersOf(cfg, "a")).toBeNull();
  });

  it("ignores synthetic map-body groups", () => {
    // A map's body members are grouped by the projection, not by the author.
    // They have their own layout rules, so a drag must not treat them as a
    // unit the way it treats a group someone made on purpose.
    const cfg = makeConfig(
      { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } },
      { __map_body_m1: groupOf("a", "b") },
    );
    expect(userGroupMembersOf(cfg, "a")).toBeNull();
  });
});

describe("resolveGroupDragExtras", () => {
  it("names the co-members xyflow is not already moving", () => {
    const cfg = makeConfig(
      { a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, c: { x: 20, y: 0 } },
      { g1: groupOf("a", "b", "c") },
    );
    expect(resolveGroupDragExtras(cfg, ["a"]).sort()).toEqual(["b", "c"]);
  });

  it("returns nothing when the whole group is already in the drag", () => {
    const cfg = makeConfig(
      { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } },
      { g1: groupOf("a", "b") },
    );
    expect(resolveGroupDragExtras(cfg, ["a", "b"])).toEqual([]);
  });

  it("unions across every group represented in a multi-node drag", () => {
    const cfg = makeConfig(
      {
        a: { x: 0, y: 0 },
        b: { x: 10, y: 0 },
        c: { x: 20, y: 0 },
        d: { x: 30, y: 0 },
      },
      { g1: groupOf("a", "b"), g2: groupOf("c", "d") },
    );
    expect(resolveGroupDragExtras(cfg, ["a", "c"]).sort()).toEqual(["b", "d"]);
  });

  it("skips members that no longer exist", () => {
    // A group outlives the deletion of a member until something prunes it;
    // moving a phantom would write a position for a node that is not there.
    const cfg = makeConfig({ a: { x: 0, y: 0 } }, { g1: groupOf("a", "gone") });
    expect(resolveGroupDragExtras(cfg, ["a"])).toEqual([]);
  });

  it("returns nothing for an ungrouped drag", () => {
    const cfg = makeConfig({ a: { x: 0, y: 0 }, b: { x: 10, y: 0 } });
    expect(resolveGroupDragExtras(cfg, ["a"])).toEqual([]);
  });
});

describe("captureGroupDragCohort", () => {
  it("snapshots each carried member's origin", () => {
    const cfg = makeConfig(
      { a: { x: 0, y: 0 }, b: { x: 100, y: 50 } },
      { g1: groupOf("a", "b") },
    );
    const cohort = captureGroupDragCohort(cfg, "a", { x: 0, y: 0 }, ["a"]);
    expect(cohort?.anchorId).toBe("a");
    expect(cohort?.startPositions.get("b")).toEqual({ x: 100, y: 50 });
  });

  it("returns null when there is nothing extra to carry", () => {
    const cfg = makeConfig({ a: { x: 0, y: 0 } });
    expect(captureGroupDragCohort(cfg, "a", { x: 0, y: 0 }, ["a"])).toBeNull();
  });

  it("returns null when no carried member has an authored position", () => {
    // Never placed → let the layout keep owning it rather than inventing an
    // origin and dragging it in from nowhere.
    const cfg = makeConfig(
      { a: { x: 0, y: 0 }, b: null },
      { g1: groupOf("a", "b") },
    );
    expect(captureGroupDragCohort(cfg, "a", { x: 0, y: 0 }, ["a"])).toBeNull();
  });
});

describe("applyGroupDragDelta", () => {
  it("moves every carried member by the anchor's delta", () => {
    const cfg = makeConfig(
      { a: { x: 0, y: 0 }, b: { x: 100, y: 50 }, c: { x: -20, y: 10 } },
      { g1: groupOf("a", "b", "c") },
    );
    const cohort = captureGroupDragCohort(cfg, "a", { x: 0, y: 0 }, ["a"]);
    if (!cohort) throw new Error("expected a cohort");
    const moves = applyGroupDragDelta(cohort, { x: 30, y: -15 });
    expect(moves.get("b")).toEqual({ x: 130, y: 35 });
    expect(moves.get("c")).toEqual({ x: 10, y: -5 });
  });

  it("preserves relative spacing — the group keeps its shape", () => {
    const cfg = makeConfig(
      { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
      { g1: groupOf("a", "b") },
    );
    const cohort = captureGroupDragCohort(cfg, "a", { x: 0, y: 0 }, ["a"]);
    if (!cohort) throw new Error("expected a cohort");
    const anchorAt = { x: 500, y: 500 };
    const b = applyGroupDragDelta(cohort, anchorAt).get("b");
    expect(b && b.x - anchorAt.x).toBe(100);
    expect(b && b.y - anchorAt.y).toBe(0);
  });
});
