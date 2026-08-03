/**
 * Group header drag (R-1, 2026-08-03).
 *
 * The rule under test: a drag of the group's container box carries every
 * declared member of that group by the same delta, and nothing else. It
 * REPLACES the 2026-08-02 rule these tests used to pin, where any member's
 * drag carried its siblings — see the module comment for why that expired.
 *
 * Deleted members, synthetic map-body groups and never-placed members are each
 * excluded for a different reason; see the individual cases.
 */

import { describe, expect, it } from "vitest";
import type { GraphWorkflowConfig } from "../../../types/workflow";
import {
  applyGroupDragDelta,
  captureGroupDragCohort,
  resolveGroupDragExtras,
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

describe("resolveGroupDragExtras", () => {
  it("names every member of the dragged group", () => {
    const cfg = makeConfig(
      { a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, c: { x: 20, y: 0 } },
      { g1: groupOf("a", "b", "c") },
    );
    expect(resolveGroupDragExtras(cfg, "g1").sort()).toEqual(["a", "b", "c"]);
  });

  it("names only the dragged group's members", () => {
    const cfg = makeConfig(
      {
        a: { x: 0, y: 0 },
        b: { x: 10, y: 0 },
        c: { x: 20, y: 0 },
        d: { x: 30, y: 0 },
      },
      { g1: groupOf("a", "b"), g2: groupOf("c", "d") },
    );
    expect(resolveGroupDragExtras(cfg, "g1").sort()).toEqual(["a", "b"]);
  });

  it("skips members that no longer exist", () => {
    // A group outlives the deletion of a member until something prunes it;
    // moving a phantom would write a position for a node that is not there.
    const cfg = makeConfig({ a: { x: 0, y: 0 } }, { g1: groupOf("a", "gone") });
    expect(resolveGroupDragExtras(cfg, "g1")).toEqual(["a"]);
  });

  it("refuses a synthetic map-body group", () => {
    // A map's body is derived from the map node's entry/exit, not arranged as
    // a unit — the canvas renders its box non-draggable, and the maths agrees.
    const cfg = makeConfig(
      { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } },
      { __map_body_m1: groupOf("a", "b") },
    );
    expect(resolveGroupDragExtras(cfg, "__map_body_m1")).toEqual([]);
  });

  it("returns nothing for an unknown group id", () => {
    const cfg = makeConfig({ a: { x: 0, y: 0 } });
    expect(resolveGroupDragExtras(cfg, "nope")).toEqual([]);
  });
});

describe("captureGroupDragCohort", () => {
  it("snapshots each member's origin against the box as anchor", () => {
    const cfg = makeConfig(
      { a: { x: 0, y: 0 }, b: { x: 100, y: 50 } },
      { g1: groupOf("a", "b") },
    );
    const cohort = captureGroupDragCohort(cfg, "g1", "container-g1", {
      x: -40,
      y: -40,
    });
    expect(cohort?.anchorId).toBe("container-g1");
    expect(cohort?.startPositions.get("a")).toEqual({ x: 0, y: 0 });
    expect(cohort?.startPositions.get("b")).toEqual({ x: 100, y: 50 });
  });

  it("returns null for a synthetic map-body group", () => {
    const cfg = makeConfig(
      { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } },
      { __map_body_m1: groupOf("a", "b") },
    );
    expect(
      captureGroupDragCohort(cfg, "__map_body_m1", "container-__map_body_m1", {
        x: 0,
        y: 0,
      }),
    ).toBeNull();
  });

  it("returns null when no member has an authored position", () => {
    // Never placed → let the layout keep owning it rather than inventing an
    // origin and dragging it in from nowhere.
    const cfg = makeConfig({ a: null, b: null }, { g1: groupOf("a", "b") });
    expect(
      captureGroupDragCohort(cfg, "g1", "container-g1", { x: 0, y: 0 }),
    ).toBeNull();
  });
});

describe("applyGroupDragDelta", () => {
  it("moves every member by the box's delta", () => {
    const cfg = makeConfig(
      { a: { x: 0, y: 0 }, b: { x: 100, y: 50 }, c: { x: -20, y: 10 } },
      { g1: groupOf("a", "b", "c") },
    );
    const cohort = captureGroupDragCohort(cfg, "g1", "container-g1", {
      x: 0,
      y: 0,
    });
    if (!cohort) throw new Error("expected a cohort");
    const moves = applyGroupDragDelta(cohort, { x: 30, y: -15 });
    expect(moves.get("a")).toEqual({ x: 30, y: -15 });
    expect(moves.get("b")).toEqual({ x: 130, y: 35 });
    expect(moves.get("c")).toEqual({ x: 10, y: -5 });
  });

  it("preserves relative spacing — the group keeps its shape", () => {
    const cfg = makeConfig(
      { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
      { g1: groupOf("a", "b") },
    );
    const cohort = captureGroupDragCohort(cfg, "g1", "container-g1", {
      x: -40,
      y: -40,
    });
    if (!cohort) throw new Error("expected a cohort");
    const moves = applyGroupDragDelta(cohort, { x: 460, y: 460 });
    const a = moves.get("a");
    const b = moves.get("b");
    expect(a).toEqual({ x: 500, y: 500 });
    expect(b && b.x - (a?.x ?? 0)).toBe(100);
    expect(b && b.y - (a?.y ?? 0)).toBe(0);
  });
});
