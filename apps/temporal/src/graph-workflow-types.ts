/**
 * Graph Workflow Configuration TypeScript Types
 *
 * Defines the complete type system for the DAG workflow engine.
 * These types are shared between backend-services and temporal worker.
 * See docs-md/graph-workflows/DAG_WORKFLOW_ENGINE.md for the full specification.
 */

// ---------------------------------------------------------------------------
// Top-Level Config
// ---------------------------------------------------------------------------

export interface GraphWorkflowConfig {
  schemaVersion: "1.0";
  metadata: GraphMetadata;
  nodes: Record<string, GraphNode>;
  edges: GraphEdge[];
  entryNodeId: string;
  ctx: Record<string, CtxDeclaration>;
  nodeGroups?: Record<string, NodeGroup>;
}

export interface GraphMetadata {
  name?: string;
  description?: string;
  version?: string;
  tags?: string[];
}

export interface CtxDeclaration {
  type: "string" | "number" | "boolean" | "object" | "array";
  description?: string;
  defaultValue?: unknown;
}

export interface NodeGroup {
  label: string;
  description?: string;
  icon?: string;
  color?: string;
  nodeIds: string[];
  exposedParams?: ExposedParam[];
}

export interface ExposedParam {
  label: string;
  path: string;
  type: "string" | "number" | "boolean" | "select" | "duration";
  options?: string[];
  default?: unknown;
}

// ---------------------------------------------------------------------------
// Node Types
// ---------------------------------------------------------------------------

export type NodeType =
  | "activity"
  | "switch"
  | "map"
  | "join"
  | "childWorkflow"
  | "pollUntil"
  | "humanGate";

export interface GraphNodeBase {
  id: string;
  type: NodeType;
  label: string;
  inputs?: PortBinding[];
  outputs?: PortBinding[];
  errorPolicy?: ErrorPolicy;
  metadata?: Record<string, unknown>;
}

export interface PortBinding {
  port: string;
  ctxKey: string;
}

export interface ErrorPolicy {
  retryable: boolean;
  fallbackEdgeId?: string;
  maxRetries?: number;
  onError: "fail" | "fallback" | "skip";
}

// -- Activity Node ----------------------------------------------------------

export interface ActivityNode extends GraphNodeBase {
  type: "activity";
  activityType: string;
  parameters?: Record<string, unknown>;
  retry?: RetryPolicy;
  timeout?: TimeoutPolicy;
}

export interface RetryPolicy {
  maximumAttempts?: number;
  initialInterval?: string;
  backoffCoefficient?: number;
  maximumInterval?: string;
}

export interface TimeoutPolicy {
  startToClose?: string;
  scheduleToClose?: string;
}

// -- Switch Node ------------------------------------------------------------

export interface SwitchNode extends GraphNodeBase {
  type: "switch";
  cases: SwitchCase[];
  defaultEdge?: string;
}

export interface SwitchCase {
  condition: ConditionExpression;
  edgeId: string;
}

// -- Map Node (Fan-Out) -----------------------------------------------------

export interface MapNode extends GraphNodeBase {
  type: "map";
  collectionCtxKey: string;
  itemCtxKey: string;
  indexCtxKey?: string;
  maxConcurrency?: number;
  bodyEntryNodeId: string;
  bodyExitNodeId: string;
}

// -- Join Node (Fan-In) -----------------------------------------------------

export interface JoinNode extends GraphNodeBase {
  type: "join";
  sourceMapNodeId: string;
  strategy: "all" | "any";
  resultsCtxKey: string;
}

// -- ChildWorkflow Node -----------------------------------------------------

export interface ChildWorkflowNode extends GraphNodeBase {
  type: "childWorkflow";
  workflowRef:
    | { type: "library"; workflowId: string }
    | { type: "inline"; graph: GraphWorkflowConfig };
  inputMappings?: PortBinding[];
  outputMappings?: PortBinding[];
}

// -- PollUntil Node ---------------------------------------------------------

export interface PollUntilNode extends GraphNodeBase {
  type: "pollUntil";
  activityType: string;
  condition: ConditionExpression;
  interval: string;
  maxAttempts?: number;
  initialDelay?: string;
  timeout?: string;
  parameters?: Record<string, unknown>;
}

// -- HumanGate Node ---------------------------------------------------------

export interface HumanGateNode extends GraphNodeBase {
  type: "humanGate";
  signal: {
    name: string;
    payloadSchema?: Record<string, unknown>;
  };
  timeout: string;
  onTimeout: "fail" | "continue" | "fallback";
  fallbackEdgeId?: string;
}

// -- Discriminated Union ----------------------------------------------------

export type GraphNode =
  | ActivityNode
  | SwitchNode
  | MapNode
  | JoinNode
  | ChildWorkflowNode
  | PollUntilNode
  | HumanGateNode;

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

export interface GraphEdge {
  id: string;
  source: string;
  sourcePort?: string;
  target: string;
  targetPort?: string;
  type: "normal" | "conditional" | "error";
  condition?: string;
}

// ---------------------------------------------------------------------------
// Expression Language (Structured Operator DSL)
// ---------------------------------------------------------------------------

export type ConditionExpression =
  | ComparisonExpression
  | LogicalExpression
  | NotExpression
  | NullCheckExpression
  | ListMembershipExpression;

export interface ComparisonExpression {
  operator: "equals" | "not-equals" | "gt" | "gte" | "lt" | "lte" | "contains";
  left: ValueRef;
  right: ValueRef;
}

export interface LogicalExpression {
  operator: "and" | "or";
  operands: ConditionExpression[];
}

export interface NotExpression {
  operator: "not";
  operand: ConditionExpression;
}

export interface NullCheckExpression {
  operator: "is-null" | "is-not-null";
  value: ValueRef;
}

export interface ListMembershipExpression {
  operator: "in" | "not-in";
  value: ValueRef;
  list: ValueRef;
}

export type ValueRef =
  | { ref: string; literal?: never }
  | { literal: unknown; ref?: never };

// ---------------------------------------------------------------------------
// Execution I/O
// ---------------------------------------------------------------------------

export interface GraphWorkflowInput {
  graph: GraphWorkflowConfig;
  initialCtx: Record<string, unknown>;
  configHash: string;
  runnerVersion: string;
  parentWorkflowId?: string;
  /** Correlation ID from the API request; for cross-service tracing. */
  requestId?: string;
}

export interface GraphWorkflowResult {
  ctx: Record<string, unknown>;
  completedNodes: string[];
  status: "completed" | "failed" | "cancelled";
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface GraphValidationError {
  path: string;
  message: string;
  severity: "error" | "warning";
}

// ---------------------------------------------------------------------------
// Status / Query Types
// ---------------------------------------------------------------------------

export type NodeStatusValue =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export interface NodeStatus {
  status: NodeStatusValue;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface GraphWorkflowStatus {
  currentNodes: string[];
  nodeStatuses: Record<string, NodeStatus>;
  overallStatus: "running" | "completed" | "failed" | "cancelled";
  ctx: Record<string, unknown>;
  error?: string;
  lastError?: {
    nodeId: string;
    message: string;
    type?: string;
    retryable?: boolean;
  };
}

export interface GraphWorkflowProgress {
  completedCount: number;
  totalCount: number;
  currentNodes: string[];
  progressPercentage: number;
}

export interface CancelSignal {
  mode: "graceful" | "immediate";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const GRAPH_RUNNER_VERSION = "1.0.0";
