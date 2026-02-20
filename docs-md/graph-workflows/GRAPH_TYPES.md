# Graph Workflow Type System

This document describes the TypeScript type system for the DAG workflow engine. For the full requirements specification, see [DAG_WORKFLOW_ENGINE.md](./DAG_WORKFLOW_ENGINE.md).

## Type Locations

Types are defined in two locations (identical content, no shared import path):

- **Backend**: `apps/backend-services/src/workflow/graph-workflow-types.ts`
- **Temporal Worker**: `apps/temporal/src/graph-workflow-types.ts`

## Top-Level Config

`GraphWorkflowConfig` is the root type stored in the `workflows.config` JSONB column:

```typescript
interface GraphWorkflowConfig {
  schemaVersion: "1.0";
  metadata: GraphMetadata;
  nodes: Record<string, GraphNode>;
  edges: GraphEdge[];
  entryNodeId: string;
  ctx: Record<string, CtxDeclaration>;
}
```

## Node Types

Seven node types, all extending `GraphNodeBase`:

| Type | Interface | Purpose |
|---|---|---|
| `activity` | `ActivityNode` | Executes a registered Temporal activity |
| `switch` | `SwitchNode` | Conditional branching via expression evaluation |
| `map` | `MapNode` | Fan-out: iterate over a collection in parallel |
| `join` | `JoinNode` | Fan-in: collect results from map branches |
| `childWorkflow` | `ChildWorkflowNode` | Invoke a subgraph as a Temporal child workflow |
| `pollUntil` | `PollUntilNode` | Poll an activity until a condition is met |
| `humanGate` | `HumanGateNode` | Pause for human approval via Temporal signal |

The `GraphNode` discriminated union covers all types.

## Expression Language

The structured operator DSL is used for switch conditions and pollUntil stop conditions:

```typescript
type ConditionExpression =
  | ComparisonExpression   // equals, not-equals, gt, gte, lt, lte, contains
  | LogicalExpression      // and, or (with short-circuit)
  | NotExpression          // not
  | NullCheckExpression    // is-null, is-not-null
  | ListMembershipExpression; // in, not-in
```

Values are referenced via `ValueRef`:
- `{ ref: "ctx.someKey" }` - context variable reference (dot notation)
- `{ literal: someValue }` - literal value

### Variable Namespaces

- `ctx.<key>` - workflow context
- `doc.<field>` - alias for `ctx.documentMetadata.<field>`
- `segment.<field>` - alias for `ctx.currentSegment.<field>`

## Activity Registry

Activities are identified by string keys (e.g., `"azureOcr.submit"`):

- **Temporal runtime registry**: `apps/temporal/src/activity-registry.ts` - maps types to actual functions
- **Backend constant registry**: `apps/backend-services/src/workflow/activity-registry.ts` - descriptions only for save-time validation

12 registered activity types: `document.updateStatus`, `file.prepare`, `azureOcr.submit`, `azureOcr.poll`, `azureOcr.extract`, `ocr.cleanup`, `ocr.checkConfidence`, `ocr.storeResults`, `document.storeRejection`, `document.split`, `document.classify`, `document.validateFields`.

## Validation

Two validators share core logic but run in different contexts:

- **Backend** (`graph-schema-validator.ts`): Save-time validation with constant-based activity type checking
- **Temporal** (`graph-schema-validator.ts`): Execution-time defensive check with runtime registry validation

Both check: schema version, node/edge integrity, DAG structure (cycle detection), reachability, switch/map/join cross-references, port bindings, and expression validity.

## Blob Storage

`LocalBlobStorageService` provides key-based file access:

```typescript
interface BlobStorageInterface {
  write(key: string, data: Buffer): Promise<void>;
  read(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}
```

Segment naming convention: `documents/{documentId}/segments/segment-{NNN}-pages-{start}-{end}.pdf`

---

## Node Groups (UI-Only Metadata)

**Purpose**: `nodeGroups` is an optional field on `GraphWorkflowConfig` that provides UI-friendly grouping and parameter exposure for workflow visualization. It does **not** affect execution—the Temporal graph runner ignores it entirely.

### Schema

```typescript
interface GraphWorkflowConfig {
  // ... existing fields ...
  nodeGroups?: Record<string, NodeGroup>;
}

interface NodeGroup {
  label: string;              // Display name for the group
  description?: string;        // Brief description of what this group does
  icon?: string;              // Icon identifier (e.g., "scan", "cleanup", "human")
  color?: string;             // Hex color for the group block (e.g., "#3b82f6")
  nodeIds: string[];          // Array of node IDs that belong to this group
  exposedParams?: ExposedParam[];
}

interface ExposedParam {
  label: string;              // User-friendly parameter label
  path: string;               // Dot-path into config (e.g., "nodes.checkConfidence.parameters.threshold")
  type: "string" | "number" | "boolean" | "select" | "duration";
  options?: string[];         // For type "select"
  default?: unknown;          // Default value
}
```

### Usage

**Simplified View**: The frontend workflow editor supports a "Simplified" vs "Detailed" toggle. In simplified mode:
- Nodes listed in `nodeGroups[].nodeIds` are collapsed into composite blocks
- Ungrouped nodes appear individually
- Edges between groups are aggregated (if multiple nodes in group A connect to group B, only one edge is shown)
- Internal edges (both source and target in the same group) are hidden

**Exposed Parameters**: `exposedParams` defines which configuration values should be editable in a simplified template-based UI (future feature). The `path` field uses dot notation to reference any field in the config.

### Config Hash Behavior

**Important**: The `nodeGroups` field is **excluded** from the config hash computation. Adding, removing, or modifying node groups does not change the config hash, does not bump the workflow version, and does not cause Temporal replay issues. This is because `applyDefaults()` in `config-hash.ts` explicitly constructs the output with only execution-relevant fields.

### Validation

The backend and temporal validators perform lightweight checks on `nodeGroups`:
- Each group's `nodeIds` must be non-empty
- All referenced `nodeIds` must exist in `config.nodes`
- `exposedParams` paths starting with `nodes.` must reference existing nodes
- A node appearing in multiple groups produces a **warning** (not an error)

### Example

See [`docs-md/templates/standard-ocr-workflow.json`](./templates/standard-ocr-workflow.json) for a complete example with 5 node groups:
- `ocr-extraction`: 6 nodes (status updates, file prep, OCR submission, polling, extraction)
- `cleanup`: 1 node (post-OCR cleanup)
- `quality-gate`: 2 nodes (confidence check, switch)
- `human-review`: 1 node (human gate)
- `store`: 1 node (store results)
