/**
 * Graph workflow config types used for hashing and override application.
 * Execution/workflow I/O types remain in each app's graph-workflow-types module.
 */

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
  /** SHA-256 of normalized config; set on save, excluded from hash input. */
  configHash?: string;
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

export interface SwitchNode extends GraphNodeBase {
  type: "switch";
  cases: SwitchCase[];
  defaultEdge?: string;
}

export interface SwitchCase {
  condition: ConditionExpression;
  edgeId: string;
}

export interface MapNode extends GraphNodeBase {
  type: "map";
  collectionCtxKey: string;
  itemCtxKey: string;
  indexCtxKey?: string;
  maxConcurrency?: number;
  bodyEntryNodeId: string;
  bodyExitNodeId: string;
}

export interface JoinNode extends GraphNodeBase {
  type: "join";
  sourceMapNodeId: string;
  strategy: "all" | "any";
  resultsCtxKey: string;
}

export interface ChildWorkflowNode extends GraphNodeBase {
  type: "childWorkflow";
  workflowRef:
    | { type: "library"; workflowId: string }
    | { type: "inline"; graph: GraphWorkflowConfig };
  inputMappings?: PortBinding[];
  outputMappings?: PortBinding[];
}

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

export type GraphNode =
  | ActivityNode
  | SwitchNode
  | MapNode
  | JoinNode
  | ChildWorkflowNode
  | PollUntilNode
  | HumanGateNode;

export interface GraphEdge {
  id: string;
  source: string;
  sourcePort?: string;
  target: string;
  targetPort?: string;
  type: "normal" | "conditional" | "error";
  condition?: string;
}

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
