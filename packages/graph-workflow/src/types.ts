/**
 * Graph Workflow Configuration TypeScript Types
 *
 * Defines the complete type system for the DAG workflow engine.
 * Single source of truth — all apps import from this package.
 * See docs-md/graph-workflows/DAG_WORKFLOW_ENGINE.md for the full specification.
 */

import type { KindRef } from "./types/artifacts";

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
  /**
   * Discriminator: `"workflow"` (or absent) marks a standalone, runnable
   * workflow; `"library"` marks a saved building-block whose top-level
   * `inputs[]` / `outputs[]` define its public signature for use as a
   * `childWorkflow` target. Set by the V2 editor's "Save as library"
   * action; absent on legacy configs (interpreted as `"workflow"`).
   *
   * The DB column `WorkflowLineage.workflow_kind` is authoritative for
   * listing/filtering; this metadata field is the in-flight encoding
   * carried inside the serialized `GraphWorkflowConfig`.
   */
  kind?: "workflow" | "library";
  /**
   * Declared library inputs. Only meaningful when `kind === "library"`.
   * Each entry describes a port the library exposes to its callers.
   */
  inputs?: LibraryPortDescriptor[];
  /**
   * Declared library outputs. Only meaningful when `kind === "library"`.
   */
  outputs?: LibraryPortDescriptor[];
}

/**
 * Signature row for a library workflow's declared input or output port.
 * The visual builder's "Save as library" modal writes these into
 * `GraphMetadata.inputs[]` / `outputs[]`. They become the typed port
 * descriptors of `childWorkflow` nodes that reference the library in
 * Phase 3 (typed I/O on cross-workflow edges).
 */
export interface LibraryPortDescriptor {
  label: string;
  path: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  /**
   * Artifact-layer annotation. Coexists with `type` — `type` is runtime-shape;
   * `kind` is the typed-I/O kind. Omitted = `Artifact` wildcard.
   */
  kind?: KindRef;
}

export interface CtxDeclaration {
  type: "string" | "number" | "boolean" | "object" | "array";
  description?: string;
  defaultValue?: unknown;
  /**
   * Marks this ctx entry as a caller-supplied input. Ctx declarations
   * flagged `isInput: true` are surfaced in the workflow's derived
   * run-spec input schema (the JSON Schema returned by
   * `GET /api/workflows/:id/run-spec` and rendered in the Run drawer).
   * Library workflows ignore this flag and source their inputs from
   * `GraphMetadata.inputs[]` instead.
   */
  isInput?: boolean;
  /**
   * Artifact-layer annotation. Coexists with `type` — `type` is runtime-shape;
   * `kind` is the typed-I/O kind. Omitted = `Artifact` wildcard.
   */
  kind?: KindRef;
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
  /**
   * Optional id of the node within the owning group whose parameter this
   * exposes. The visual builder's group panel (US-044) uses it to scope
   * the `path` selector to a single member node and to prune entries when
   * the referenced node is removed from the group.
   */
  nodeId?: string;
  path: string;
  type: "string" | "number" | "boolean" | "select" | "duration";
  options?: string[];
  default?: unknown;
}

// ---------------------------------------------------------------------------
// Node Types
// ---------------------------------------------------------------------------

/**
 * Discriminator union for every node variant in the graph.
 *
 * The `"source"` variant is Phase 8's intake-as-node abstraction — see
 * `docs-md/workflow-builder/DOCUMENT_SOURCES_DESIGN.md` §1 ("The source
 * node TYPE") for the locked schema and rationale. Source nodes have no
 * input handle, declare a `sourceType` resolved against the source
 * catalog, and carry static `parameters` validated against the subtype's
 * `parametersSchema`.
 */
export type NodeType =
  | "activity"
  | "switch"
  | "map"
  | "join"
  | "childWorkflow"
  | "pollUntil"
  | "humanGate"
  | "source";

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
    | {
        type: "library";
        workflowId: string;
        /** Optional. When set, pins the child execution to this specific `WorkflowVersion.versionNumber`. When omitted, the runtime resolves to the library's head. */
        version?: number;
      }
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

// -- Source Node ------------------------------------------------------------

/**
 * Phase 8 source node — the workflow's edge to the outside world.
 *
 * Source nodes have no upstream (`inputs` MUST be empty/absent — enforced
 * by the validator, NOT the type, so the discriminated union stays
 * ergonomic for incremental graph-edit operations). Their `sourceType`
 * resolves against the source catalog (SOURCE_CATALOG) at validation
 * time. Their `parameters` are validated against the subtype's
 * `parametersSchema`. See DOCUMENT_SOURCES_DESIGN.md §1.
 */
export interface SourceNode extends GraphNodeBase {
  type: "source";
  /** Subtype id resolved against the source catalog (SOURCE_CATALOG); e.g. "source.api" or "source.upload" */
  sourceType: string;
  parameters?: Record<string, unknown>;
}

// -- Discriminated Union ----------------------------------------------------

export type GraphNode =
  | ActivityNode
  | SwitchNode
  | MapNode
  | JoinNode
  | ChildWorkflowNode
  | PollUntilNode
  | HumanGateNode
  | SourceNode;

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
  /** The group_id of the document/workflow owner; auto-injected into activity inputs as `groupId`. */
  groupId?: string | null;
  /**
   * Per-org workflow lineage id (`WorkflowLineage.id`). Used by the Phase 4
   * activity-output cache as the tenancy / sharing scope for cached
   * activity outputs — see `apps/temporal/src/cache/cached-activity.ts`
   * and `feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md` L14.
   * When omitted, the per-node cache decorator is bypassed (activities
   * still execute, just without cache reads/writes).
   */
  workflowLineageId?: string | null;
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
