/**
 * Skeleton builders for the six control-flow node types.
 *
 * Each builder returns a fully-typed `GraphNode` with the defaults
 * locked in for US-011 Scenario 3:
 *   - switch        → cases: []
 *   - map           → itemCtxKey: "currentSegment" (D24), empty collection
 *                     ctxKey + empty body refs
 *   - join          → empty sourceMapNodeId, strategy: "all"
 *   - childWorkflow → workflowRef: { type: "library", workflowId: "" }
 *   - pollUntil     → empty activityType, interval: "30s"
 *   - humanGate     → signal.name: "humanApproval", timeout: "1h", onTimeout: "fail"
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

export type ControlFlowNodeType = Exclude<NodeType, "activity" | "source">;

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

/**
 * Default fan-out width for a newly dropped map (G-067).
 *
 * Omitting `maxConcurrency` does not mean "some sensible number" — it means
 * UNBOUNDED, so a map over 200 segments starts 200 activities at once and
 * swamps the worker and the upstream API. Every shipped workflow sets a limit
 * by hand; only palette-created maps carried the unbounded default, so the
 * defect only ever bit newly authored graphs.
 *
 * The two shipped maps use 5 and 10; 5 is the conservative end of that range,
 * and a default that is too small only costs wall-clock, while one that is too
 * large costs a rate-limit breach. The author can raise it in the map's form.
 */
export const DEFAULT_MAP_MAX_CONCURRENCY = 5;

/**
 * Default item variable for a newly dropped map (D24).
 *
 * `itemCtxKey` is required and was created EMPTY, which is a hard validation
 * error on every new loop before the author has touched it — the node arrives
 * already red.
 *
 * `currentSegment` rather than any other name because the choice is not
 * cosmetic: the `segment.<field>` shorthand in condition expressions is
 * hard-wired to read `ctx.currentSegment`
 * (`graph-workflow/src/validator/context-utils.ts` CTX_NAMESPACE_PREFIXES;
 * `apps/temporal/src/expression-evaluator.ts` traversePath). Under any other
 * name that shorthand silently resolves to `undefined` instead of erroring,
 * which is why every shipped template already uses this one.
 *
 * This is a CREATION-time default only. Nothing rewrites a saved config, so
 * existing workflows — including the seeded one that uses `currentDoc` — keep
 * whatever they were authored with.
 *
 * The cost it introduces is two maps in one graph starting out sharing a key;
 * `validateMapItemKeyCollisions` in the shared validator warns about that
 * (a warning, not an error — sharing the key is legal).
 */
export const DEFAULT_MAP_ITEM_CTX_KEY = "currentSegment";

function buildMapSkeleton(id: string): MapNode {
  return {
    id,
    type: "map",
    label: entryFor("map").displayName,
    collectionCtxKey: "",
    itemCtxKey: DEFAULT_MAP_ITEM_CTX_KEY,
    maxConcurrency: DEFAULT_MAP_MAX_CONCURRENCY,
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
    // `humanApproval` is the name the built-in HITL review flow sends, so a
    // freshly dropped gate is resumable by default. An empty name would save
    // clean and produce a gate nothing could ever open.
    signal: { name: "humanApproval" },
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
