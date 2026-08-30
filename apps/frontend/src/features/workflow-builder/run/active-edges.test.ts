/**
 * Unit tests for `computeActiveEdges` (US-139).
 *
 * Each test corresponds to one acceptance scenario from
 * feature-docs/20260531-workflow-builder-phase4-try-in-place/user_stories/US-139-active-edge-highlight.md.
 */

import { describe, expect, it } from "vitest";

import type {
  ActivityNode,
  GraphEdge,
  GraphNode,
  GraphWorkflowConfig,
} from "../../../types/workflow";

import { computeActiveEdges, computeTakenEdges } from "./active-edges";
import type { NodeRunStatus } from "./node-status.types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(
  nodes: GraphNode[],
  edges: GraphEdge[],
): GraphWorkflowConfig {
  const nodesRecord: Record<string, GraphNode> = {};
  for (const node of nodes) {
    nodesRecord[node.id] = node;
  }
  return {
    schemaVersion: "1.0",
    metadata: {},
    entryNodeId: nodes[0]?.id ?? "",
    nodes: nodesRecord,
    edges,
    ctx: {},
  };
}

const activity = (id: string): ActivityNode => ({
  id,
  type: "activity",
  label: id,
  activityType: "test.noop",
});

const edge = (id: string, source: string, target: string): GraphEdge => ({
  id,
  source,
  target,
  type: "normal",
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("computeActiveEdges", () => {
  it("Scenario 1 — flags the running→pending hop in a linear chain", () => {
    // a → b → c, with `b` currently running and `c` pending.
    const config = makeConfig(
      [activity("a"), activity("b"), activity("c")],
      [edge("e-ab", "a", "b"), edge("e-bc", "b", "c")],
    );
    const statuses: Record<string, NodeRunStatus> = {
      a: { status: "succeeded" },
      b: { status: "running" },
      c: { status: "pending" },
    };
    const result = computeActiveEdges(config, statuses);
    expect(result.has("e-bc")).toBe(true);
    expect(result.has("e-ab")).toBe(false);
    expect(result.size).toBe(1);
  });

  it("Scenario 2 — flags multiple active hops when two sources run in parallel", () => {
    // Diamond fan-out: a → b, a → c, where `a` is running and both
    // downstreams are pending. Both fan-out edges should animate.
    const config = makeConfig(
      [activity("a"), activity("b"), activity("c")],
      [edge("e-ab", "a", "b"), edge("e-ac", "a", "c")],
    );
    const statuses: Record<string, NodeRunStatus> = {
      a: { status: "running" },
      b: { status: "pending" },
      c: { status: "pending" },
    };
    const result = computeActiveEdges(config, statuses);
    expect(result.has("e-ab")).toBe(true);
    expect(result.has("e-ac")).toBe(true);
    expect(result.size).toBe(2);
  });

  it("Scenario 3 — returns an empty set when every node is terminal", () => {
    const config = makeConfig(
      [activity("a"), activity("b"), activity("c"), activity("d")],
      [edge("e-ab", "a", "b"), edge("e-bc", "b", "c"), edge("e-cd", "c", "d")],
    );
    const statuses: Record<string, NodeRunStatus> = {
      a: { status: "succeeded" },
      b: { status: "failed" },
      c: { status: "skipped" },
      d: { status: "cancelled" },
    };
    const result = computeActiveEdges(config, statuses);
    expect(result.size).toBe(0);
  });

  it("Scenario 6a — cache-hit (skipped) source has no active outgoing edge", () => {
    // `a` resolved via cache hit (skipped is terminal), so even with a
    // pending downstream, the edge is NOT active — no flow visible.
    const config = makeConfig(
      [activity("a"), activity("b")],
      [edge("e-ab", "a", "b")],
    );
    const statuses: Record<string, NodeRunStatus> = {
      a: {
        status: "skipped",
        cacheHit: { configHash: "ch", inputHash: "ih" },
      },
      b: { status: "pending" },
    };
    const result = computeActiveEdges(config, statuses);
    expect(result.size).toBe(0);
  });

  it("Scenario 6b — unknown target node id is treated as pending (edge is active)", () => {
    // `b` never appeared in the status map — the helper treats absent as
    // pending so the running→absent edge animates while the workflow
    // walks toward it.
    const config = makeConfig(
      [activity("a"), activity("b")],
      [edge("e-ab", "a", "b")],
    );
    const statuses: Record<string, NodeRunStatus> = {
      a: { status: "running" },
      // b: intentionally omitted
    };
    const result = computeActiveEdges(config, statuses);
    expect(result.has("e-ab")).toBe(true);
    expect(result.size).toBe(1);
  });

  it("returns empty set when nothing is running yet (everything pending)", () => {
    const config = makeConfig(
      [activity("a"), activity("b")],
      [edge("e-ab", "a", "b")],
    );
    const statuses: Record<string, NodeRunStatus> = {
      a: { status: "pending" },
      b: { status: "pending" },
    };
    const result = computeActiveEdges(config, statuses);
    expect(result.size).toBe(0);
  });

  it("excludes edges whose target has already moved past pending", () => {
    // a (running) → b (running) — the next hop is already underway, so the
    // edge between them should NOT animate (no longer a "next" hop).
    const config = makeConfig(
      [activity("a"), activity("b"), activity("c")],
      [edge("e-ab", "a", "b"), edge("e-bc", "b", "c")],
    );
    const statuses: Record<string, NodeRunStatus> = {
      a: { status: "running" },
      b: { status: "running" },
      c: { status: "pending" },
    };
    const result = computeActiveEdges(config, statuses);
    expect(result.has("e-ab")).toBe(false);
    expect(result.has("e-bc")).toBe(true);
    expect(result.size).toBe(1);
  });

  it("is a pure function — does not mutate the inputs", () => {
    const config = makeConfig(
      [activity("a"), activity("b")],
      [edge("e-ab", "a", "b")],
    );
    const statuses: Record<string, NodeRunStatus> = {
      a: { status: "running" },
      b: { status: "pending" },
    };
    const configSnapshot = JSON.stringify(config);
    const statusesSnapshot = JSON.stringify(statuses);
    computeActiveEdges(config, statuses);
    expect(JSON.stringify(config)).toBe(configSnapshot);
    expect(JSON.stringify(statuses)).toBe(statusesSnapshot);
  });
});

// ---------------------------------------------------------------------------
// G-014 — the path a finished run actually took.
//
// `computeActiveEdges` only ever marks an edge whose source is *currently*
// running, so in a replay (every node terminal) the set is empty and no path
// is shown at all. `computeTakenEdges` answers the other question: which
// edges did this run traverse.
// ---------------------------------------------------------------------------

describe("computeTakenEdges", () => {
  it("marks the taken path in a completed run, not just a live one", () => {
    const config = makeConfig(
      [activity("a"), activity("b"), activity("c")],
      [edge("e-ab", "a", "b"), edge("e-bc", "b", "c")],
    );
    const statuses: Record<string, NodeRunStatus> = {
      a: { status: "succeeded" },
      b: { status: "succeeded" },
      c: { status: "succeeded" },
    };
    // Nothing is running, so the live-animation helper finds nothing…
    expect(computeActiveEdges(config, statuses)).toEqual(new Set());
    // …but the run plainly walked both hops.
    expect(computeTakenEdges(config, statuses)).toEqual(
      new Set(["e-ab", "e-bc"]),
    );
  });

  it("marks nothing for a branch that was not taken", () => {
    // sw branches to `yes` or `no`; the run picked `e-yes`.
    const config = makeConfig(
      [activity("sw"), activity("yes"), activity("no")],
      [edge("e-yes", "sw", "yes"), edge("e-no", "sw", "no")],
    );
    const statuses: Record<string, NodeRunStatus> = {
      sw: { status: "succeeded", selectedEdgeId: "e-yes" },
      yes: { status: "succeeded" },
    };
    const taken = computeTakenEdges(config, statuses);
    expect(taken.has("e-yes")).toBe(true);
    expect(taken.has("e-no")).toBe(false);
  });

  it("marks the error edge an errorPolicy fallback diverted onto", () => {
    const config = makeConfig(
      [activity("a"), activity("ok"), activity("recover")],
      [edge("e-ok", "a", "ok"), edge("e-err", "a", "recover")],
    );
    const statuses: Record<string, NodeRunStatus> = {
      a: { status: "failed", selectedEdgeId: "e-err" },
      recover: { status: "succeeded" },
    };
    expect(computeTakenEdges(config, statuses)).toEqual(new Set(["e-err"]));
  });

  it("takes nothing out of a node that failed with no fallback", () => {
    const config = makeConfig(
      [activity("a"), activity("b")],
      [edge("e-ab", "a", "b")],
    );
    const statuses: Record<string, NodeRunStatus> = {
      a: { status: "failed" },
    };
    expect(computeTakenEdges(config, statuses)).toEqual(new Set());
  });

  it("treats a cache-served (skipped) node as having routed onward", () => {
    const config = makeConfig(
      [activity("a"), activity("b")],
      [edge("e-ab", "a", "b")],
    );
    const statuses: Record<string, NodeRunStatus> = {
      a: { status: "skipped" },
      b: { status: "succeeded" },
    };
    expect(computeTakenEdges(config, statuses)).toEqual(new Set(["e-ab"]));
  });

  it("takes nothing out of a node that has not finished", () => {
    const config = makeConfig(
      [activity("a"), activity("b")],
      [edge("e-ab", "a", "b")],
    );
    expect(computeTakenEdges(config, { a: { status: "running" } })).toEqual(
      new Set(),
    );
    expect(computeTakenEdges(config, {})).toEqual(new Set());
  });

  it("still animates the live in-flight edge during a running workflow (regression)", () => {
    // The live behaviour must survive G-014: a running source with a pending
    // target still animates, and the hops already walked are *also* marked
    // taken — the two sets are independent and both correct.
    const config = makeConfig(
      [activity("a"), activity("b"), activity("c")],
      [edge("e-ab", "a", "b"), edge("e-bc", "b", "c")],
    );
    const statuses: Record<string, NodeRunStatus> = {
      a: { status: "succeeded" },
      b: { status: "running" },
      c: { status: "pending" },
    };
    expect(computeActiveEdges(config, statuses)).toEqual(new Set(["e-bc"]));
    expect(computeTakenEdges(config, statuses)).toEqual(new Set(["e-ab"]));
  });
});
