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
import {
  buildControlFlowSkeleton,
  DEFAULT_MAP_ITEM_CTX_KEY,
  DEFAULT_MAP_MAX_CONCURRENCY,
} from "./control-flow-skeletons";

describe("buildControlFlowSkeleton", () => {
  it("switch → returns a SwitchNode with empty cases", () => {
    const node = buildControlFlowSkeleton("switch", "switch_1") as SwitchNode;
    expect(node.id).toBe("switch_1");
    expect(node.type).toBe("switch");
    expect(node.label).toBe("Branch by condition");
    expect(node.cases).toEqual([]);
    expect(node.defaultEdge).toBeUndefined();
  });

  it("map → returns a MapNode with a default item ctx key and empty body refs", () => {
    const node = buildControlFlowSkeleton("map", "map_1") as MapNode;
    expect(node.id).toBe("map_1");
    expect(node.type).toBe("map");
    expect(node.label).toBe("Run for each item");
    expect(node.collectionCtxKey).toBe("");
    expect(node.itemCtxKey).toBe(DEFAULT_MAP_ITEM_CTX_KEY);
    expect(node.indexCtxKey).toBeUndefined();
    expect(node.bodyEntryNodeId).toBe("");
    expect(node.bodyExitNodeId).toBe("");
  });

  it('join → returns a JoinNode with empty sourceMapNodeId and strategy: "all"', () => {
    const node = buildControlFlowSkeleton("join", "join_1") as JoinNode;
    expect(node.id).toBe("join_1");
    expect(node.type).toBe("join");
    expect(node.label).toBe("Collect results");
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
    expect(node.label).toBe("Sub-workflow");
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
    expect(node.label).toBe("Wait until condition");
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

  it('humanGate → returns a HumanGateNode with signal.name "humanApproval", timeout "1h", onTimeout "fail"', () => {
    const node = buildControlFlowSkeleton(
      "humanGate",
      "humanGate_1",
    ) as HumanGateNode;
    expect(node.id).toBe("humanGate_1");
    expect(node.type).toBe("humanGate");
    expect(node.label).toBe("Wait for approval");
    // G-017: the skeleton ships the name the HITL review flow actually sends,
    // so a freshly dropped gate is resumable instead of permanently stuck.
    expect(node.signal).toEqual({ name: "humanApproval" });
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

describe("map skeleton seeds a concurrency limit (G-067)", () => {
  it("gives a newly dropped map a bounded fan-out", () => {
    const skeleton = buildControlFlowSkeleton("map", "m1");
    expect(skeleton.type).toBe("map");
    // Omitting maxConcurrency means UNBOUNDED, not "a sensible default" — a
    // map over 200 segments would start 200 activities at once.
    expect((skeleton as { maxConcurrency?: number }).maxConcurrency).toBe(
      DEFAULT_MAP_MAX_CONCURRENCY,
    );
    expect(DEFAULT_MAP_MAX_CONCURRENCY).toBeGreaterThan(0);
  });
});

describe("map skeleton seeds an item ctx key (D24)", () => {
  it("gives a newly dropped map a non-empty item variable", () => {
    const skeleton = buildControlFlowSkeleton("map", "m1") as MapNode;
    // An empty itemCtxKey is a hard validation error, so a map dropped from
    // the palette used to arrive already red before the author touched it.
    expect(skeleton.itemCtxKey).not.toBe("");
    expect(skeleton.itemCtxKey.trim()).toBe(skeleton.itemCtxKey);
  });

  it("uses currentSegment, the only name the segment.field shorthand reads", () => {
    // Not cosmetic: `segment.<field>` in condition expressions is hard-wired to
    // ctx.currentSegment, so any other default would silently disable it.
    expect(DEFAULT_MAP_ITEM_CTX_KEY).toBe("currentSegment");
    expect((buildControlFlowSkeleton("map", "m1") as MapNode).itemCtxKey).toBe(
      "currentSegment",
    );
  });

  it("leaves the collection key empty — there is no defensible default for it", () => {
    // The collection is workflow-specific; only the item name has one right
    // answer. Defaulting both would hide the field the author must fill in.
    expect(
      (buildControlFlowSkeleton("map", "m1") as MapNode).collectionCtxKey,
    ).toBe("");
  });

  it("is a creation-time default only — the builder never sees a saved node", () => {
    // Guards the "existing workflows must be untouched" half of D24: this
    // module's only export path is construction from a palette drop, so there
    // is no code path here that could rewrite a loaded config.
    const a = buildControlFlowSkeleton("map", "m1") as MapNode;
    const b = buildControlFlowSkeleton("map", "m2") as MapNode;
    expect(a).not.toBe(b);
    expect(a.itemCtxKey).toBe(b.itemCtxKey);
  });
});
