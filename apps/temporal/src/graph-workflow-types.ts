/**
 * Graph Workflow Types
 *
 * Graph structure types are re-exported from @ai-di/graph-workflow.
 * Execution/workflow I/O types below are app-specific.
 */
import type { GraphWorkflowConfig } from "@ai-di/graph-workflow";
import type { OcrPayloadRef } from "./ocr-payload-ref-types";

export type {
  ActivityNode,
  CancelSignal,
  ChildWorkflowNode,
  ComparisonExpression,
  ConditionExpression,
  CtxDeclaration,
  ErrorPolicy,
  ExposedParam,
  GraphEdge,
  GraphMetadata,
  GraphNode,
  GraphNodeBase,
  GraphValidationError,
  GraphWorkflowConfig,
  GraphWorkflowProgress,
  GraphWorkflowStatus,
  HumanGateNode,
  JoinNode,
  ListMembershipExpression,
  LogicalExpression,
  MapNode,
  NodeGroup,
  NodeStatus,
  NodeStatusValue,
  NodeType,
  NotExpression,
  NullCheckExpression,
  PollUntilNode,
  PortBinding,
  RetryPolicy,
  SourceNode,
  SwitchCase,
  SwitchNode,
  TimeoutPolicy,
  ValueRef,
} from "@ai-di/graph-workflow";

export { GRAPH_RUNNER_VERSION } from "@ai-di/graph-workflow";

export interface GraphWorkflowInput {
  /** WorkflowVersion.id, WorkflowLineage.id, or WorkflowLineage.name (see getWorkflowGraphConfig). */
  workflowVersionId: string;
  configHash: string;
  initialCtx: Record<string, unknown>;
  runnerVersion: string;
  parentWorkflowId?: string;
  /** Correlation ID from the API request; for cross-service tracing. */
  requestId?: string;
  /** The group_id of the document/workflow owner; auto-injected into activity inputs as `groupId`. */
  groupId?: string | null;
  /** Exposed-param overrides merged at load time (benchmark / ground truth). */
  workflowConfigOverrides?: Record<string, unknown>;
  /**
   * Phase 4 (US-133) try-in-place cache scope. When set alongside a wired
   * `cacheDeps`, per-node activity dispatch goes through the output cache.
   */
  workflowLineageId?: string | null;
  /**
   * Phase 6 Milestone C (US-170) — workflow-run identifier injected into
   * `dyn.run` as `AI_DI_WORKFLOW_RUN_ID`. Populated from `workflowInfo()`.
   */
  workflowRunId?: string;
  /**
   * What started this run (G-021): `"try"` for an editor preview from the
   * canvas, `"api"` for a production run. The activity-output cache is
   * enabled only when `trigger === "try"` — production-scope caching is
   * deferred (Phase 4.x) pending a GDPR review. Absence is treated as
   * production (cache bypassed), the safe direction. Propagated into every
   * child workflow (map fan-out and library children) so Try caching
   * survives fan-out. Mirrors `GraphWorkflowInput.trigger` in
   * `@ai-di/graph-workflow`.
   */
  trigger?: "try" | "api";
  /**
   * How many child-workflow spawns deep this execution is. `0` (or absent)
   * for a run started from the API; each `executeChild` site passes the
   * parent's depth + 1. The runtime backstop for cross-workflow reference
   * cycles (a library workflow that reaches itself through another): the
   * shared validator only catches inline self-embedding, so an A→B→A chain
   * validates green and would otherwise spawn children forever. Spawning is
   * refused beyond `MAX_CHILD_WORKFLOW_DEPTH` (see
   * `graph-engine/node-executors.ts`).
   */
  childDepth?: number;
}

/** Graph config loaded inside graphWorkflow (not in Temporal start args). */
export interface GraphWorkflowExecutionInput extends GraphWorkflowInput {
  graph: GraphWorkflowConfig;
}

export interface GraphWorkflowResult {
  status: "completed" | "failed" | "cancelled";
  completedNodes: string[];
  documentId?: string;
  refs?: {
    ocrResponseRef?: OcrPayloadRef;
    ocrResultRef?: OcrPayloadRef;
    cleanedResultRef?: OcrPayloadRef;
  };
  failedNodeId?: string;
  outputPaths?: string[];
  error?: string;
}
