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

import { computeActiveEdges } from "./active-edges";
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
