/**
 * Tests for `nextNodePosition` — the pure helper that computes the
 * landing coordinates of a newly-extended node relative to its source
 * (US-045).
 */

import { describe, expect, it } from "vitest";
import type { GraphWorkflowConfig } from "../../../types/workflow";
import { findNextFreePosition, nextNodePosition } from "./place-extended-node";

describe("nextNodePosition", () => {
  it("defaults to 280px to the right of the source at the same y", () => {
    expect(nextNodePosition({ x: 100, y: 50 })).toEqual({ x: 380, y: 50 });
  });

  it("respects custom dx / dy overrides", () => {
    expect(nextNodePosition({ x: 100, y: 50 }, { dx: 320, dy: 40 })).toEqual({
      x: 420,
      y: 90,
    });
  });

  it("treats a missing override field as the default for that axis", () => {
    expect(nextNodePosition({ x: 0, y: 0 }, { dx: 100 })).toEqual({
      x: 100,
      y: 0,
    });
    expect(nextNodePosition({ x: 0, y: 0 }, { dy: 60 })).toEqual({
      x: 280,
      y: 60,
    });
  });
});

function makeConfig(
  nodes: Array<{ id: string; x: number; y: number }>,
  edges: Array<{ id: string; source: string; target: string }> = [],
): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "t", version: "1.0.0" },
    ctx: {},
    nodes: Object.fromEntries(
      nodes.map((n) => [
        n.id,
        {
          id: n.id,
          type: "activity",
          label: n.id,
          activityType: "noop",
          inputs: [],
          outputs: [],
          parameters: {},
          metadata: { position: { x: n.x, y: n.y } },
        },
      ]),
    ),
    edges: edges.map((e) => ({ ...e, type: "normal" as const })),
    entryNodeId: nodes[0]?.id ?? "",
  };
}

describe("findNextFreePosition", () => {
  it("returns the default offset when the canvas is empty", () => {
    const config = makeConfig([{ id: "src", x: 100, y: 100 }]);
    const pos = findNextFreePosition(config, "src");
    expect(pos).toEqual({ x: 380, y: 100 }); // default dx=280, dy=0
  });

  it("steps below the existing collision when the default slot is occupied", () => {
    const config = makeConfig([
      { id: "src", x: 100, y: 100 },
      { id: "blocker", x: 380, y: 100 },
    ]);
    const pos = findNextFreePosition(config, "src");
    expect(pos.x).toBe(380);
    expect(pos.y).not.toBe(100);
  });

  it("places below the lowest existing outgoing-edge target for switch sources", () => {
    const config = makeConfig(
      [
        { id: "src", x: 100, y: 100 },
        { id: "case1", x: 380, y: 100 },
        { id: "case2", x: 380, y: 240 },
      ],
      [
        { id: "e1", source: "src", target: "case1" },
        { id: "e2", source: "src", target: "case2" },
      ],
    );
    // Mark src as switch type for the helper to take the switch branch.
    config.nodes.src = {
      ...config.nodes.src,
      type: "switch",
      cases: [],
    } as never;
    const pos = findNextFreePosition(config, "src");
    expect(pos.x).toBe(380);
    expect(pos.y).toBeGreaterThanOrEqual(380); // 240 + 140
  });

  it("honours dx/dy overrides", () => {
    const config = makeConfig([{ id: "src", x: 100, y: 100 }]);
    const pos = findNextFreePosition(config, "src", { dx: 200, dy: 50 });
    expect(pos).toEqual({ x: 300, y: 150 });
  });
});
