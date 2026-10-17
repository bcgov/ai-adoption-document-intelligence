/**
 * Coupling tests for `removeNodesFromConfig` — specifically G-029, the
 * obligation that a delete which removes an edge must also clear every node
 * field that named that edge by id.
 *
 * The sweep itself is unit-tested in
 * `packages/graph-workflow/src/auto-wire/prune-edge-references.test.ts`; what
 * these tests guard is that the delete path actually calls it, which is the
 * coupling that was missing.
 */
import type {
  ActivityNode,
  HumanGateNode,
  SwitchNode,
} from "@ai-di/graph-workflow";
import { describe, expect, it } from "vitest";
import { config, node } from "./__test-utils__/config-fixtures";
import { removeNodesFromConfig } from "./remove-nodes";

/** `sw` switches to `a` (case) or `b` (default); deleting either kills an edge. */
function switchFixture() {
  return config({
    nodes: {
      sw: node<SwitchNode>({
        id: "sw",
        type: "switch",
        defaultEdge: "e-default",
        cases: [
          {
            edgeId: "e-case",
            condition: {
              operator: "equals",
              left: { ref: "doc.type" },
              right: { literal: "invoice" },
            },
          },
        ],
      }),
      a: node<ActivityNode>({
        id: "a",
        type: "activity",
        activityType: "file.prepare",
      }),
      b: node<ActivityNode>({
        id: "b",
        type: "activity",
        activityType: "file.prepare",
      }),
    },
    edges: [
      { id: "e-case", source: "sw", target: "a", type: "conditional" },
      { id: "e-default", source: "sw", target: "b", type: "conditional" },
    ],
    entryNodeId: "sw",
  });
}

describe("removeNodesFromConfig — G-029 edge-reference sweep", () => {
  it("drops the switch case whose edge died with the deleted target", () => {
    const next = removeNodesFromConfig(switchFixture(), new Set(["a"]));
    const sw = next.nodes.sw as SwitchNode;
    expect(sw.cases).toHaveLength(0);
    expect(sw.defaultEdge).toBe("e-default");
  });

  it("clears the switch default whose edge died with the deleted target", () => {
    const next = removeNodesFromConfig(switchFixture(), new Set(["b"]));
    const sw = next.nodes.sw as SwitchNode;
    expect(sw.defaultEdge).toBeUndefined();
    expect(sw.cases.map((c) => c.edgeId)).toEqual(["e-case"]);
  });

  it("leaves surviving references untouched", () => {
    const before = switchFixture();
    const next = removeNodesFromConfig(before, new Set([]));
    expect(next.nodes.sw).toEqual(before.nodes.sw);
  });

  it("downgrades a gate's onTimeout when its fallback target is deleted", () => {
    const cfg = config({
      nodes: {
        g: node<HumanGateNode>({
          id: "g",
          type: "humanGate",
          signal: { name: "approve" },
          timeout: "PT1H",
          onTimeout: "fallback",
          fallbackEdgeId: "e-fb",
        }),
        esc: node<ActivityNode>({
          id: "esc",
          type: "activity",
          activityType: "file.prepare",
        }),
      },
      edges: [{ id: "e-fb", source: "g", target: "esc", type: "conditional" }],
      entryNodeId: "g",
    });
    const g = removeNodesFromConfig(cfg, new Set(["esc"])).nodes
      .g as HumanGateNode;
    expect(g.fallbackEdgeId).toBeUndefined();
    expect(g.onTimeout).toBe("fail");
  });

  it("downgrades an errorPolicy fallback when its error target is deleted", () => {
    const cfg = config({
      nodes: {
        a: node<ActivityNode>({
          id: "a",
          type: "activity",
          activityType: "file.prepare",
          errorPolicy: {
            retryable: false,
            onError: "fallback",
            fallbackEdgeId: "e-err",
          },
        }),
        handler: node<ActivityNode>({
          id: "handler",
          type: "activity",
          activityType: "file.prepare",
        }),
      },
      edges: [{ id: "e-err", source: "a", target: "handler", type: "error" }],
      entryNodeId: "a",
    });
    const a = removeNodesFromConfig(cfg, new Set(["handler"])).nodes.a;
    expect(a.errorPolicy).toEqual({ retryable: false, onError: "fail" });
  });
});
