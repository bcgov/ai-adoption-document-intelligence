/**
 * Tests for `buildControlFlowSkeleton` (US-011 Scenario 3).
 *
 * Each test asserts the exact default shape per node type as locked in
 * by the story acceptance criteria.
 */

import { describe, expect, it } from "vitest";
import type {
  ChildWorkflowNode,
  HumanGateNode,
  JoinNode,
  MapNode,
  PollUntilNode,
  SwitchNode,
} from "../../../types/workflow";
import { buildControlFlowSkeleton } from "./control-flow-skeletons";

describe("buildControlFlowSkeleton", () => {
  it("switch → returns a SwitchNode with empty cases", () => {
    const node = buildControlFlowSkeleton("switch", "switch_1") as SwitchNode;
    expect(node.id).toBe("switch_1");
    expect(node.type).toBe("switch");
    expect(node.label).toBe("Switch");
    expect(node.cases).toEqual([]);
    expect(node.defaultEdge).toBeUndefined();
  });

  it("map → returns a MapNode with empty ctxKey strings and empty body refs", () => {
    const node = buildControlFlowSkeleton("map", "map_1") as MapNode;
    expect(node.id).toBe("map_1");
    expect(node.type).toBe("map");
    expect(node.label).toBe("Map (fan-out)");
    expect(node.collectionCtxKey).toBe("");
    expect(node.itemCtxKey).toBe("");
    expect(node.indexCtxKey).toBeUndefined();
    expect(node.bodyEntryNodeId).toBe("");
    expect(node.bodyExitNodeId).toBe("");
  });

  it('join → returns a JoinNode with empty sourceMapNodeId and strategy: "all"', () => {
    const node = buildControlFlowSkeleton("join", "join_1") as JoinNode;
    expect(node.id).toBe("join_1");
    expect(node.type).toBe("join");
    expect(node.label).toBe("Join (fan-in)");
    expect(node.sourceMapNodeId).toBe("");
    expect(node.strategy).toBe("all");
    expect(node.resultsCtxKey).toBe("");
  });

  it('childWorkflow → returns a ChildWorkflowNode with workflowRef { type: "library", workflowId: "" }', () => {
    const node = buildControlFlowSkeleton(
      "childWorkflow",
      "childWorkflow_1",
    ) as ChildWorkflowNode;
    expect(node.id).toBe("childWorkflow_1");
    expect(node.type).toBe("childWorkflow");
    expect(node.label).toBe("Child Workflow");
    expect(node.workflowRef).toEqual({ type: "library", workflowId: "" });
    expect(node.inputMappings).toBeUndefined();
    expect(node.outputMappings).toBeUndefined();
  });

  it('pollUntil → returns a PollUntilNode with empty activityType and interval: "30s"', () => {
    const node = buildControlFlowSkeleton(
      "pollUntil",
      "pollUntil_1",
    ) as PollUntilNode;
    expect(node.id).toBe("pollUntil_1");
    expect(node.type).toBe("pollUntil");
    expect(node.label).toBe("Poll Until");
    expect(node.activityType).toBe("");
    expect(node.interval).toBe("30s");
    // The discriminated `ConditionExpression` is required at the type
    // level — the skeleton seeds the smallest valid expression so the
    // node is well-formed on creation. The user edits it in settings.
    expect(node.condition).toBeDefined();
    expect(node.condition).toEqual({
      operator: "equals",
      left: { ref: "" },
      right: { literal: "" },
    });
  });

  it('humanGate → returns a HumanGateNode with empty signal.name, timeout "1h", onTimeout "fail"', () => {
    const node = buildControlFlowSkeleton(
      "humanGate",
      "humanGate_1",
    ) as HumanGateNode;
    expect(node.id).toBe("humanGate_1");
    expect(node.type).toBe("humanGate");
    expect(node.label).toBe("Human Gate");
    expect(node.signal).toEqual({ name: "" });
    expect(node.timeout).toBe("1h");
    expect(node.onTimeout).toBe("fail");
    expect(node.fallbackEdgeId).toBeUndefined();
  });

  it("does not set position metadata — that's the host's responsibility", () => {
    for (const type of [
      "switch",
      "map",
      "join",
      "childWorkflow",
      "pollUntil",
      "humanGate",
    ] as const) {
      const node = buildControlFlowSkeleton(type, `${type}_1`);
      expect(node.metadata).toBeUndefined();
    }
  });
});
