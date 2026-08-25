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
