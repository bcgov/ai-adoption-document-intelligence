/**
 * Skeleton builders for the six control-flow node types.
 *
 * Each builder returns a fully-typed `GraphNode` with the defaults
 * locked in for US-011 Scenario 3:
 *   - switch        → cases: []
 *   - map           → empty ctxKey strings + empty body refs
 *   - join          → empty sourceMapNodeId, strategy: "all"
 *   - childWorkflow → workflowRef: { type: "library", workflowId: "" }
 *   - pollUntil     → empty activityType, interval: "30s"
 *   - humanGate     → empty signal.name, timeout: "1h", onTimeout: "fail"
 *
 * Position metadata is intentionally NOT set here — the host
 * (`WorkflowEditorV2Page.addControlFlowNode`) injects the same
 * `x = 80 + i*240, y = 100 + (i%3)*140` stagger the activity-add path
 * uses, so the position logic stays in one place.
 *
 * `type` is narrowed to `Exclude<NodeType, "activity">` because "activity"
 * is not a control-flow type and has its own add path. This keeps each
 * builder return type precise (no `any`, no unreachable defaults).
 */

import type {
  ChildWorkflowNode,
  GraphNode,
  HumanGateNode,
  JoinNode,
  MapNode,
  NodeType,
  PollUntilNode,
  SwitchNode,
} from "../../../types/workflow";
import {
  CONTROL_FLOW_PALETTE_ENTRIES,
  type ControlFlowPaletteEntry,
} from "./control-flow-palette-entries";

export type ControlFlowNodeType = Exclude<NodeType, "activity">;

function entryFor(type: ControlFlowNodeType): ControlFlowPaletteEntry {
  const entry = CONTROL_FLOW_PALETTE_ENTRIES.find((e) => e.type === type);
  if (!entry) {
    // Should be unreachable — every ControlFlowNodeType has a palette entry.
    throw new Error(
      `No palette entry registered for control-flow type "${type}".`,
    );
  }
  return entry;
}

function buildSwitchSkeleton(id: string): SwitchNode {
  return {
    id,
    type: "switch",
    label: entryFor("switch").displayName,
    cases: [],
  };
}

function buildMapSkeleton(id: string): MapNode {
  return {
    id,
    type: "map",
    label: entryFor("map").displayName,
    collectionCtxKey: "",
    itemCtxKey: "",
    bodyEntryNodeId: "",
    bodyExitNodeId: "",
  };
}

function buildJoinSkeleton(id: string): JoinNode {
  return {
    id,
    type: "join",
    label: entryFor("join").displayName,
    sourceMapNodeId: "",
    strategy: "all",
    resultsCtxKey: "",
  };
}

function buildChildWorkflowSkeleton(id: string): ChildWorkflowNode {
  return {
    id,
    type: "childWorkflow",
    label: entryFor("childWorkflow").displayName,
    workflowRef: { type: "library", workflowId: "" },
  };
}

function buildPollUntilSkeleton(id: string): PollUntilNode {
  return {
    id,
    type: "pollUntil",
    label: entryFor("pollUntil").displayName,
    activityType: "",
    condition: {
      operator: "equals",
      left: { ref: "" },
      right: { literal: "" },
    },
    interval: "30s",
  };
}

function buildHumanGateSkeleton(id: string): HumanGateNode {
  return {
    id,
    type: "humanGate",
    label: entryFor("humanGate").displayName,
    signal: { name: "" },
    timeout: "1h",
    onTimeout: "fail",
  };
}

/**
 * Build a default skeleton node for a control-flow type. The skeleton
 * satisfies the discriminated-union shape defined in
 * `packages/graph-workflow/src/types.ts` and is safe to write directly
 * into `config.nodes`.
 */
export function buildControlFlowSkeleton(
  type: ControlFlowNodeType,
  id: string,
): GraphNode {
  switch (type) {
    case "switch":
      return buildSwitchSkeleton(id);
    case "map":
      return buildMapSkeleton(id);
    case "join":
      return buildJoinSkeleton(id);
    case "childWorkflow":
      return buildChildWorkflowSkeleton(id);
    case "pollUntil":
      return buildPollUntilSkeleton(id);
    case "humanGate":
      return buildHumanGateSkeleton(id);
    default: {
      // Exhaustiveness check — adding a new control-flow type to NodeType
      // will fail to compile here until a builder is registered.
      const exhaustive: never = type;
      throw new Error(
        `buildControlFlowSkeleton: unsupported type "${String(exhaustive)}".`,
      );
    }
  }
}
