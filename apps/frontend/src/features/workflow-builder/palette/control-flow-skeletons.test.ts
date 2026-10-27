/**
 * Tests for `buildControlFlowSkeleton` (US-011 Scenario 3).
 *
 * Each test asserts the exact default shape per node type as locked in
 * by the story acceptance criteria.
 */

import { describe, expect, it } from "vitest";
import type {
  ChildWorkflowNode,
  GraphWorkflowConfig,
  HumanGateNode,
  JoinNode,
  MapNode,
  PollUntilNode,
  SwitchNode,
} from "../../../types/workflow";
import { declareCtxKey } from "../graph-widgets/ctx-declaration";
import {
  buildControlFlowSkeleton,
  DEFAULT_MAP_ITEM_CTX_KEY,
  DEFAULT_MAP_MAX_CONCURRENCY,
  declareSkeletonCtxKeys,
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

  it('humanGate → returns a HumanGateNode with signal.name "humanApproval", no timeout, onTimeout "fail"', () => {
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
    // A review waits until someone acts on it: no time limit by default.
    expect(node).not.toHaveProperty("timeout");
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

describe("map skeleton seeds an item ctx key", () => {
  it("gives a newly dropped map a non-empty item variable", () => {
    const skeleton = buildControlFlowSkeleton("map", "m1") as MapNode;
    // An empty itemCtxKey is a hard validation error, so a map dropped from
    // the palette would arrive already red before the author touched it.
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
    // Existing workflows keep the item name they were authored with: this
    // module builds nodes to be placed, and reads no saved node.
    const a = buildControlFlowSkeleton("map", "m1") as MapNode;
    const b = buildControlFlowSkeleton("map", "m2") as MapNode;
    expect(a).not.toBe(b);
    expect(a.itemCtxKey).toBe(b.itemCtxKey);
  });
});

describe("declareSkeletonCtxKeys", () => {
  const base: GraphWorkflowConfig = {
    schemaVersion: "1.0",
    metadata: {},
    entryNodeId: "",
    nodes: {},
    edges: [],
    ctx: { documentId: { type: "string" } },
  };

  it("declares a new loop's item variable the way + Create variable does", () => {
    const loop = buildControlFlowSkeleton("map", "map_1");
    const placed: GraphWorkflowConfig = { ...base, nodes: { map_1: loop } };

    const next = declareSkeletonCtxKeys(placed, loop);

    // The same declaration the picker's "+ Create variable" writes.
    expect(next.ctx[DEFAULT_MAP_ITEM_CTX_KEY]).toEqual(
      declareCtxKey(placed, DEFAULT_MAP_ITEM_CTX_KEY).ctx[
        DEFAULT_MAP_ITEM_CTX_KEY
      ],
    );
    expect(next.ctx[DEFAULT_MAP_ITEM_CTX_KEY]).toEqual({ type: "object" });
    // Nothing else changes.
    expect(next.ctx.documentId).toEqual({ type: "string" });
    expect(next.nodes).toBe(placed.nodes);
  });

  it("leaves a name that is already declared as it is, so a second loop changes nothing", () => {
    const declared: GraphWorkflowConfig = {
      ...base,
      ctx: {
        ...base.ctx,
        [DEFAULT_MAP_ITEM_CTX_KEY]: {
          type: "object",
          description: "The segment the first loop is on",
        },
      },
    };
    const secondLoop = buildControlFlowSkeleton("map", "map_2");

    expect(declareSkeletonCtxKeys(declared, secondLoop)).toBe(declared);
  });

  it("declares nothing for the other control-flow steps", () => {
    const others = [
      "switch",
      "join",
      "childWorkflow",
      "pollUntil",
      "humanGate",
    ] as const;
    for (const type of others) {
      const node = buildControlFlowSkeleton(type, `${type}_1`);
      expect(declareSkeletonCtxKeys(base, node)).toBe(base);
    }
  });
});
