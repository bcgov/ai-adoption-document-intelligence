/**
 * Graph Workflow Types
 *
 * Graph structure types are re-exported from @ai-di/graph-workflow.
 * Execution/workflow I/O types below are app-specific.
 */
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
  SwitchCase,
  SwitchNode,
  TimeoutPolicy,
  ValueRef,
} from "@ai-di/graph-workflow";

export { GRAPH_RUNNER_VERSION } from "@ai-di/graph-workflow";

export interface OcrPayloadRef {
  documentId: string;
  blobPath: string;
  storage: "blob";
  byteLength?: number;
  pageCount?: number;
  status?: string;
}

export interface GraphWorkflowInput {
  workflowVersionId: string;
  configHash: string;
  initialCtx: Record<string, unknown>;
  runnerVersion: string;
  parentWorkflowId?: string;
  requestId?: string;
  groupId?: string | null;
  /** Exposed-param overrides merged when loading graph config in the worker. */
  workflowConfigOverrides?: Record<string, unknown>;
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
