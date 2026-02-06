# DAG Workflow Engine -- Requirements Specification

## 1. Title and Overview

This project transforms the existing linear step-based OCR workflow execution system into a generic DAG (Directed Acyclic Graph) workflow engine. The current system runs a single `ocrWorkflow` function with 11 hardcoded sequential steps controlled by enable/disable flags. The new system replaces this with a data-driven graph runner: a single `graphWorkflow` Temporal function that interprets arbitrary workflow graphs stored as JSON in the database at runtime.

The SDPR (Supplier's Declaration of Provincial Residency) monthly report with supporting documents is the initial test case, but the engine is generic from day one -- any document processing pipeline expressible as a DAG should be runnable without code changes.

### Current State

- **Temporal workflow**: `ocrWorkflow()` with 11 sequential steps, each wrapped in `isStepEnabled()` guards
- **Config format**: `WorkflowStepsConfig` -- flat map of step IDs to `{ enabled: boolean, parameters?: Record<string, unknown> }`
- **Frontend**: Form-based workflow builder (toggle switches per step) + custom SVG `WorkflowVisualization` component
- **Backend**: NestJS CRUD endpoints (`/api/workflows`) with Prisma-backed `workflows` table (config stored as JSONB)
- **Worker**: Single Temporal worker running `ocrWorkflow`, dispatched via `TemporalClientService.startOCRWorkflow()`

### Target State

- **Temporal workflow**: `graphWorkflow()` -- a generic graph interpreter that reads a DAG definition and executes nodes according to topological order with parallel branches
- **Config format**: Graph JSON schema with typed nodes, directed edges with port bindings, and a workflow-scoped context (`ctx`)
- **Frontend**: JSON text editor with React Flow (`@xyflow/react`) read-only visualization, auto-synced with debounce
- **Backend**: Updated CRUD endpoints accepting the new graph JSON, validation against the graph schema, same `workflows` table with replaced config format

---

## 2. Goals and Non-Goals

### Goals

1. **Generic DAG execution engine** that interprets workflow graphs at runtime without per-workflow code
2. **First-class node types**: `activity`, `switch`, `map` (fan-out), `join` (fan-in), `childWorkflow`, `pollUntil`, `humanGate`
3. **Hybrid data flow model**: workflow-scoped `ctx` store at runtime, with declared input/output port bindings on each node
4. **Per-node error handling**: optional error policies with fallback edges (e.g., `onError` -> `humanGate`)
5. **Multi-page document support**: split documents up to 2,000+ pages, process segments in parallel via `map`/`join`
6. **React Flow visualization**: read-only view derived from the graph JSON, replacing the custom SVG component
7. **JSON editor**: replace the form-based step toggle UI with a JSON text editor for graph authoring
8. **Library workflows**: reusable subgraph templates stored in the database, invocable as `childWorkflow` nodes
9. **Clean break**: no backward compatibility with the old `WorkflowStepsConfig` format
10. **Externalized binary payloads**: pass file references (blob keys / document IDs) instead of inline base64 data

### Non-Goals

1. **Visual drag-and-drop editing** -- future phase; build the React Flow view so it can be upgraded to editing with minimal effort, but do not implement editing interactions
2. **CEL expression language** -- future phase; start with the structured operator DSL for `switch` conditions
3. **Cloud blob storage** -- local filesystem for development; the abstraction layer should support future migration but only local implementation is required now
4. **Backward-compatible config migration** -- old workflows are not automatically converted; users recreate them
5. **Custom Temporal workflow types per graph** -- all graphs run through the single `graphWorkflow` function
6. **AI/ML-based document classification** -- start with rule-based heuristics for boundary/type detection; ML classifiers are a future enhancement

---

## 3. Architecture Overview

```
                           +--------------------------+
                           |        Frontend          |
                           |    (React + Mantine)     |
                           |                          |
                           |  WorkflowListPage        |
                           |  WorkflowEditorPage      |
                           |    - JSON Editor panel   |
                           |    - React Flow panel    |
                           +-----------+--------------+
                                       |
                             REST API (unchanged base)
                                       |
                                       v
  +-----------------+     +----------------------------+
  |   PostgreSQL    |<--->|     Backend Services       |
  |                 |     |        (NestJS)            |
  |  workflows      |     |                            |
  |  documents      |     |  WorkflowController        |
  |  ocr_results    |     |  WorkflowService           |
  |  ...            |     |  GraphSchemaValidator       |
  +-----------------+     |  TemporalClientService      |
                          +------------+---------------+
                                       |
                              Starts Temporal workflow
                                       |
                                       v
                          +------------+---------------+
                          |      Temporal Server       |
                          |  (namespace: default,      |
                          |   task queue: ocr-processing)|
                          +------------+---------------+
                                       |
                              Dispatches to worker
                                       |
                                       v
                          +------------+---------------+
                          |      Temporal Worker       |
                          |                            |
                          |  graphWorkflow() runner    |
                          |  Activity registry         |
                          |  Node-type interpreters    |
                          |  Expression evaluator      |
                          +----------------------------+
                                       |
                              Calls Azure APIs,
                              reads/writes filesystem,
                              updates database
                                       |
                                       v
                          +----------------------------+
                          |  Azure Doc Intelligence    |
                          |  Local Filesystem (blobs)  |
                          +----------------------------+
```

### Key Architectural Decisions

1. **Single `graphWorkflow` function**: All graph definitions are interpreted by one Temporal workflow function. No code deployment needed for new workflow types.
2. **Activity registry**: A mapping from activity type strings (e.g., `"azureOcr.submit"`, `"document.split"`) to actual Temporal activity implementations. The graph JSON references activities by registry key.
3. **Deterministic execution**: The graph runner schedules nodes in a stable topological sort order. Parallel branches are scheduled in deterministic order by node ID.
4. **Library workflows as data**: Reusable subgraphs are stored as `Workflow` records in the database. A `childWorkflow` node references a library workflow by its database ID. At runtime, the graph runner starts a new `graphWorkflow` Temporal child workflow with the referenced subgraph.

---

## 4. Graph Schema Specification

### 4.1 Top-Level Structure

```typescript
interface GraphWorkflowConfig {
  schemaVersion: "1.0";
  metadata: {
    description?: string;
    tags?: string[];
  };
  nodes: Record<string, GraphNode>;
  edges: GraphEdge[];
  entryNodeId: string;        // Node to execute first (must have no incoming edges)
  ctx: {                      // Initial context key declarations
    [key: string]: {
      type: "string" | "number" | "boolean" | "object" | "array";
      description?: string;
      defaultValue?: unknown;
    };
  };
}
```

### 4.2 Node Types

All nodes share a common base:

```typescript
interface GraphNodeBase {
  id: string;                 // Unique within the graph
  type: NodeType;
  label: string;              // Display name for visualization
  inputs?: PortBinding[];     // Maps ctx keys to this node's input slots
  outputs?: PortBinding[];    // Maps this node's output slots to ctx keys
  errorPolicy?: ErrorPolicy;  // Optional per-node error handling
  metadata?: Record<string, unknown>;  // UI hints, position data, etc.
}

type NodeType = "activity" | "switch" | "map" | "join" | "childWorkflow" | "pollUntil" | "humanGate";

interface PortBinding {
  port: string;               // Port name on this node (e.g., "documentId", "ocrResult")
  ctxKey: string;             // Key in the workflow context
}
```

#### 4.2.1 Activity Node

Executes a registered Temporal activity.

```typescript
interface ActivityNode extends GraphNodeBase {
  type: "activity";
  activityType: string;       // Registry key, e.g., "azureOcr.submit"
  parameters?: Record<string, unknown>;  // Static parameters merged with runtime inputs
  retry?: {
    maximumAttempts?: number;
    initialInterval?: string;  // Duration string, e.g., "1s"
    backoffCoefficient?: number;
    maximumInterval?: string;
  };
  timeout?: {
    startToClose?: string;     // Duration string, e.g., "2m"
    scheduleToClose?: string;
  };
}
```

#### 4.2.2 Switch Node

Conditional branching. Evaluates a condition and routes to one of several output edges.

```typescript
interface SwitchNode extends GraphNodeBase {
  type: "switch";
  cases: SwitchCase[];
  defaultEdge?: string;       // Edge ID for the default/fallthrough case
}

interface SwitchCase {
  condition: ConditionExpression;
  edgeId: string;             // ID of the edge to follow if condition is true
}
```

See Section 14 (Expression Language) for the `ConditionExpression` type.

#### 4.2.3 Map Node (Fan-Out)

Iterates over a collection from ctx and spawns parallel branches.

```typescript
interface MapNode extends GraphNodeBase {
  type: "map";
  collectionCtxKey: string;   // ctx key holding the array to iterate
  itemCtxKey: string;         // ctx key for each item within the sub-branch
  indexCtxKey?: string;       // ctx key for the iteration index
  maxConcurrency?: number;    // Limit parallel execution (default: unbounded)
  bodyEntryNodeId: string;    // First node of the body subgraph
  bodyExitNodeId: string;     // Last node of the body subgraph (results collected here)
}
```

#### 4.2.4 Join Node (Fan-In)

Collects results from parallel branches spawned by a `map` node.

```typescript
interface JoinNode extends GraphNodeBase {
  type: "join";
  sourceMapNodeId: string;    // The map node whose branches to join
  strategy: "all" | "any";    // Wait for all branches or first success
  resultsCtxKey: string;      // ctx key where the collected array of results is stored
}
```

#### 4.2.5 ChildWorkflow Node

Invokes another graph workflow definition as a Temporal child workflow.

```typescript
interface ChildWorkflowNode extends GraphNodeBase {
  type: "childWorkflow";
  workflowRef: {
    type: "library";          // References a Workflow record in the database
    workflowId: string;       // Database ID of the library workflow
  } | {
    type: "inline";           // Embeds a subgraph directly
    graph: GraphWorkflowConfig;
  };
  inputMappings?: PortBinding[];   // Map parent ctx keys to child workflow inputs
  outputMappings?: PortBinding[];  // Map child workflow outputs back to parent ctx keys
}
```

#### 4.2.6 PollUntil Node

Repeatedly executes an activity until a condition is met.

```typescript
interface PollUntilNode extends GraphNodeBase {
  type: "pollUntil";
  activityType: string;       // Activity to poll
  condition: ConditionExpression;  // Stop polling when this is true
  interval: string;           // Duration between polls, e.g., "10s"
  maxAttempts?: number;       // Maximum poll iterations (default: 100)
  initialDelay?: string;      // Delay before first poll, e.g., "5s"
  timeout?: string;           // Overall timeout, e.g., "30m"
  parameters?: Record<string, unknown>;
}
```

**Execution strategy**: The graph runner compiles this into an activity call + durable sleep loop within the workflow function. For polls expected to take a long time or return large payloads, the runner may instead launch a child workflow to keep the parent history bounded. This is an implementation detail transparent to the graph author.

#### 4.2.7 HumanGate Node

Pauses execution and waits for a human signal.

```typescript
interface HumanGateNode extends GraphNodeBase {
  type: "humanGate";
  signal: {
    name: string;             // Temporal signal name, e.g., "humanApproval"
    payloadSchema?: Record<string, unknown>;  // Expected signal payload shape
  };
  timeout: string;            // Duration to wait, e.g., "24h"
  onTimeout: "fail" | "continue" | "fallback";
  fallbackEdgeId?: string;    // Used when onTimeout is "fallback"
}
```

**Execution strategy**: Maps to Temporal `condition()` + timer pattern. The signal name is registered on the workflow, and the workflow blocks until the signal is received or the timeout expires.

### 4.3 Edges

```typescript
interface GraphEdge {
  id: string;
  source: string;             // Source node ID
  sourcePort?: string;        // Output port on source (default: "out")
  target: string;             // Target node ID
  targetPort?: string;        // Input port on target (default: "in")
  type: "normal" | "conditional" | "error";
  condition?: string;         // For switch case edges, references the case label
}
```

Edge types:
- `"normal"` -- standard flow from one node to the next
- `"conditional"` -- used by `switch` nodes; associated with a specific case
- `"error"` -- fallback path from a node's error port; only followed when the source node fails and has an `errorPolicy` with `fallbackEdgeId`

### 4.4 Worked Example: Current OCR Workflow as a Graph

This is the equivalent of the current 11-step `ocrWorkflow` expressed in the new graph schema:

```json
{
  "schemaVersion": "1.0",
  "metadata": {
    "description": "Standard OCR processing workflow (equivalent to legacy ocrWorkflow)",
    "tags": ["ocr", "azure", "standard"]
  },
  "entryNodeId": "updateStatus",
  "ctx": {
    "documentId": { "type": "string", "description": "Document ID from database" },
    "blobKey": { "type": "string", "description": "File reference on local storage" },
    "fileName": { "type": "string" },
    "fileType": { "type": "string" },
    "contentType": { "type": "string" },
    "modelId": { "type": "string", "defaultValue": "prebuilt-layout" },
    "apimRequestId": { "type": "string" },
    "ocrResponse": { "type": "object" },
    "ocrResult": { "type": "object" },
    "cleanedResult": { "type": "object" },
    "averageConfidence": { "type": "number" },
    "requiresReview": { "type": "boolean", "defaultValue": false }
  },
  "nodes": {
    "updateStatus": {
      "id": "updateStatus",
      "type": "activity",
      "label": "Update Status",
      "activityType": "document.updateStatus",
      "inputs": [{ "port": "documentId", "ctxKey": "documentId" }],
      "parameters": { "status": "ongoing_ocr" },
      "timeout": { "startToClose": "30s" },
      "retry": { "maximumAttempts": 5 }
    },
    "prepareFileData": {
      "id": "prepareFileData",
      "type": "activity",
      "label": "Prepare File Data",
      "activityType": "file.prepare",
      "inputs": [
        { "port": "blobKey", "ctxKey": "blobKey" },
        { "port": "fileName", "ctxKey": "fileName" },
        { "port": "fileType", "ctxKey": "fileType" },
        { "port": "contentType", "ctxKey": "contentType" },
        { "port": "modelId", "ctxKey": "modelId" }
      ],
      "outputs": [
        { "port": "preparedData", "ctxKey": "preparedFileData" }
      ],
      "timeout": { "startToClose": "1m" },
      "retry": { "maximumAttempts": 3 }
    },
    "submitOcr": {
      "id": "submitOcr",
      "type": "activity",
      "label": "Submit to Azure OCR",
      "activityType": "azureOcr.submit",
      "inputs": [{ "port": "fileData", "ctxKey": "preparedFileData" }],
      "outputs": [{ "port": "apimRequestId", "ctxKey": "apimRequestId" }],
      "timeout": { "startToClose": "2m" },
      "retry": { "maximumAttempts": 3 }
    },
    "updateApimRequestId": {
      "id": "updateApimRequestId",
      "type": "activity",
      "label": "Update APIM Request ID",
      "activityType": "document.updateStatus",
      "inputs": [
        { "port": "documentId", "ctxKey": "documentId" },
        { "port": "apimRequestId", "ctxKey": "apimRequestId" }
      ],
      "parameters": { "status": "ongoing_ocr" },
      "timeout": { "startToClose": "30s" },
      "retry": { "maximumAttempts": 5 }
    },
    "pollOcrResults": {
      "id": "pollOcrResults",
      "type": "pollUntil",
      "label": "Poll OCR Results",
      "activityType": "azureOcr.poll",
      "inputs": [
        { "port": "apimRequestId", "ctxKey": "apimRequestId" },
        { "port": "modelId", "ctxKey": "modelId" }
      ],
      "outputs": [{ "port": "response", "ctxKey": "ocrResponse" }],
      "condition": {
        "operator": "not-equals",
        "left": { "ref": "ctx.ocrResponse.status" },
        "right": { "literal": "running" }
      },
      "interval": "10s",
      "initialDelay": "5s",
      "maxAttempts": 20,
      "timeout": "10m"
    },
    "extractResults": {
      "id": "extractResults",
      "type": "activity",
      "label": "Extract OCR Results",
      "activityType": "azureOcr.extract",
      "inputs": [
        { "port": "apimRequestId", "ctxKey": "apimRequestId" },
        { "port": "ocrResponse", "ctxKey": "ocrResponse" },
        { "port": "fileName", "ctxKey": "fileName" },
        { "port": "fileType", "ctxKey": "fileType" },
        { "port": "modelId", "ctxKey": "modelId" }
      ],
      "outputs": [{ "port": "ocrResult", "ctxKey": "ocrResult" }],
      "timeout": { "startToClose": "1m" },
      "retry": { "maximumAttempts": 3 }
    },
    "postOcrCleanup": {
      "id": "postOcrCleanup",
      "type": "activity",
      "label": "Post-OCR Cleanup",
      "activityType": "ocr.cleanup",
      "inputs": [{ "port": "ocrResult", "ctxKey": "ocrResult" }],
      "outputs": [{ "port": "cleanedResult", "ctxKey": "cleanedResult" }],
      "timeout": { "startToClose": "2m" },
      "retry": { "maximumAttempts": 3 }
    },
    "checkConfidence": {
      "id": "checkConfidence",
      "type": "activity",
      "label": "Check OCR Confidence",
      "activityType": "ocr.checkConfidence",
      "inputs": [
        { "port": "documentId", "ctxKey": "documentId" },
        { "port": "ocrResult", "ctxKey": "cleanedResult" }
      ],
      "outputs": [
        { "port": "averageConfidence", "ctxKey": "averageConfidence" },
        { "port": "requiresReview", "ctxKey": "requiresReview" }
      ],
      "parameters": { "threshold": 0.95 },
      "timeout": { "startToClose": "30s" },
      "retry": { "maximumAttempts": 3 }
    },
    "reviewSwitch": {
      "id": "reviewSwitch",
      "type": "switch",
      "label": "Needs Review?",
      "inputs": [{ "port": "requiresReview", "ctxKey": "requiresReview" }],
      "cases": [
        {
          "condition": {
            "operator": "equals",
            "left": { "ref": "ctx.requiresReview" },
            "right": { "literal": true }
          },
          "edgeId": "edge-switch-to-humanGate"
        }
      ],
      "defaultEdge": "edge-switch-to-store"
    },
    "humanReview": {
      "id": "humanReview",
      "type": "humanGate",
      "label": "Human Review",
      "signal": {
        "name": "humanApproval",
        "payloadSchema": {
          "approved": "boolean",
          "reviewer": "string",
          "comments": "string",
          "rejectionReason": "string",
          "annotations": "string"
        }
      },
      "timeout": "24h",
      "onTimeout": "fail"
    },
    "storeResults": {
      "id": "storeResults",
      "type": "activity",
      "label": "Store Results",
      "activityType": "ocr.storeResults",
      "inputs": [
        { "port": "documentId", "ctxKey": "documentId" },
        { "port": "ocrResult", "ctxKey": "cleanedResult" }
      ],
      "timeout": { "startToClose": "2m" },
      "retry": { "maximumAttempts": 5 }
    }
  },
  "edges": [
    { "id": "e1", "source": "updateStatus", "target": "prepareFileData", "type": "normal" },
    { "id": "e2", "source": "prepareFileData", "target": "submitOcr", "type": "normal" },
    { "id": "e3", "source": "submitOcr", "target": "updateApimRequestId", "type": "normal" },
    { "id": "e4", "source": "updateApimRequestId", "target": "pollOcrResults", "type": "normal" },
    { "id": "e5", "source": "pollOcrResults", "target": "extractResults", "type": "normal" },
    { "id": "e6", "source": "extractResults", "target": "postOcrCleanup", "type": "normal" },
    { "id": "e7", "source": "postOcrCleanup", "target": "checkConfidence", "type": "normal" },
    { "id": "e8", "source": "checkConfidence", "target": "reviewSwitch", "type": "normal" },
    { "id": "edge-switch-to-humanGate", "source": "reviewSwitch", "target": "humanReview", "type": "conditional", "condition": "requiresReview" },
    { "id": "edge-switch-to-store", "source": "reviewSwitch", "target": "storeResults", "type": "conditional", "condition": "default" },
    { "id": "e11", "source": "humanReview", "target": "storeResults", "type": "normal" }
  ]
}
```

### 4.5 Worked Example: SDPR Monthly Report with Supporting Documents

This demonstrates multi-page document splitting, parallel OCR, classification, and aggregation:

```json
{
  "schemaVersion": "1.0",
  "metadata": {
    "description": "SDPR Monthly Report: split multi-page document, OCR each segment, classify, aggregate",
    "tags": ["sdpr", "multi-page", "classification"]
  },
  "entryNodeId": "updateStatus",
  "ctx": {
    "documentId": { "type": "string" },
    "blobKey": { "type": "string" },
    "fileName": { "type": "string" },
    "segments": { "type": "array", "description": "Array of { pageRange, blobKey, segmentIndex }" },
    "currentSegment": { "type": "object", "description": "Current segment in map iteration" },
    "segmentOcrResult": { "type": "object" },
    "segmentType": { "type": "string", "description": "Classified document type for segment" },
    "processedSegments": { "type": "array", "description": "Collected results from all segments" },
    "aggregatedReport": { "type": "object" }
  },
  "nodes": {
    "updateStatus": {
      "id": "updateStatus",
      "type": "activity",
      "label": "Update Status",
      "activityType": "document.updateStatus",
      "inputs": [{ "port": "documentId", "ctxKey": "documentId" }],
      "parameters": { "status": "ongoing_ocr" }
    },
    "splitDocument": {
      "id": "splitDocument",
      "type": "activity",
      "label": "Split Document",
      "activityType": "document.split",
      "inputs": [{ "port": "blobKey", "ctxKey": "blobKey" }],
      "outputs": [{ "port": "segments", "ctxKey": "segments" }],
      "parameters": { "strategy": "boundary-detection" },
      "timeout": { "startToClose": "5m" }
    },
    "processSegments": {
      "id": "processSegments",
      "type": "map",
      "label": "Process Each Segment",
      "collectionCtxKey": "segments",
      "itemCtxKey": "currentSegment",
      "maxConcurrency": 10,
      "bodyEntryNodeId": "segmentOcr",
      "bodyExitNodeId": "classifySegment"
    },
    "segmentOcr": {
      "id": "segmentOcr",
      "type": "childWorkflow",
      "label": "OCR Segment",
      "workflowRef": {
        "type": "library",
        "workflowId": "standard-ocr-workflow-id"
      },
      "inputMappings": [
        { "port": "blobKey", "ctxKey": "currentSegment.blobKey" },
        { "port": "documentId", "ctxKey": "documentId" }
      ],
      "outputMappings": [
        { "port": "ocrResult", "ctxKey": "segmentOcrResult" }
      ]
    },
    "classifySegment": {
      "id": "classifySegment",
      "type": "activity",
      "label": "Classify Segment",
      "activityType": "document.classify",
      "inputs": [
        { "port": "ocrResult", "ctxKey": "segmentOcrResult" },
        { "port": "segment", "ctxKey": "currentSegment" }
      ],
      "outputs": [{ "port": "segmentType", "ctxKey": "segmentType" }],
      "parameters": { "classifierType": "rule-based" }
    },
    "collectResults": {
      "id": "collectResults",
      "type": "join",
      "label": "Collect Segment Results",
      "sourceMapNodeId": "processSegments",
      "strategy": "all",
      "resultsCtxKey": "processedSegments"
    },
    "aggregateReport": {
      "id": "aggregateReport",
      "type": "activity",
      "label": "Aggregate Report",
      "activityType": "sdpr.aggregate",
      "inputs": [
        { "port": "processedSegments", "ctxKey": "processedSegments" },
        { "port": "documentId", "ctxKey": "documentId" }
      ],
      "outputs": [{ "port": "report", "ctxKey": "aggregatedReport" }]
    },
    "storeResults": {
      "id": "storeResults",
      "type": "activity",
      "label": "Store Results",
      "activityType": "ocr.storeResults",
      "inputs": [
        { "port": "documentId", "ctxKey": "documentId" },
        { "port": "ocrResult", "ctxKey": "aggregatedReport" }
      ]
    }
  },
  "edges": [
    { "id": "e1", "source": "updateStatus", "target": "splitDocument", "type": "normal" },
    { "id": "e2", "source": "splitDocument", "target": "processSegments", "type": "normal" },
    { "id": "e3", "source": "processSegments", "target": "collectResults", "type": "normal" },
    { "id": "e4", "source": "collectResults", "target": "aggregateReport", "type": "normal" },
    { "id": "e5", "source": "aggregateReport", "target": "storeResults", "type": "normal" }
  ]
}
```

---

## 5. Temporal Execution Engine

### 5.1 The `graphWorkflow` Function

A single exported Temporal workflow function that replaces `ocrWorkflow`:

```typescript
export const GRAPH_WORKFLOW_TYPE = 'graphWorkflow';

export async function graphWorkflow(input: GraphWorkflowInput): Promise<GraphWorkflowResult>;
```

**Input**:

```typescript
interface GraphWorkflowInput {
  graph: GraphWorkflowConfig;    // The full graph definition
  initialCtx: Record<string, unknown>;  // Initial context values (documentId, blobKey, etc.)
  configHash: string;            // SHA-256 of the canonicalized graph (see Section 12)
  runnerVersion: string;         // Version of the graph runner engine
  parentWorkflowId?: string;     // Set when invoked as a child workflow
}
```

**Result**:

```typescript
interface GraphWorkflowResult {
  ctx: Record<string, unknown>;  // Final context state
  completedNodes: string[];      // IDs of all nodes that completed
  status: "completed" | "failed" | "cancelled";
}
```

### 5.2 Execution Algorithm

The graph runner follows this algorithm:

1. **Parse and validate** the graph definition
2. **Initialize `ctx`** from `initialCtx` merged with `ctx` defaults from the graph schema
3. **Compute topological order** using stable sort (alphabetical by node ID as tiebreaker)
4. **Maintain a "ready set"**: nodes whose all incoming `normal` edges have their source nodes completed
5. **Main loop**:
   a. From the ready set, pick all nodes that can execute in parallel
   b. Schedule them in deterministic order (sorted by node ID)
   c. For each node, based on its `type`:
      - `activity`: resolve input port bindings from ctx, call the proxied activity, write outputs back to ctx
      - `switch`: evaluate cases in order, follow the first matching edge (or default)
      - `map`: iterate over the collection, spawn parallel branches (respecting `maxConcurrency`)
      - `join`: wait for all (or any) branches from the corresponding `map`, collect results into ctx
      - `childWorkflow`: start a child `graphWorkflow` with the referenced subgraph
      - `pollUntil`: execute activity + sleep loop until condition or timeout
      - `humanGate`: register signal handler, wait via `condition()` with timeout
   d. On node completion, update ready set
   e. Check for cancellation signals
6. **Return** final ctx and completion status

### 5.3 Determinism Requirements

Temporal workflows must be deterministic (same inputs produce same execution). The graph runner ensures this by:

- Using a **stable topological sort** (always same ordering for the same graph)
- Scheduling parallel nodes in **alphabetical order by node ID**
- Using only Temporal primitives for timing (`sleep`, `condition`) -- never `Date.now()` or `Math.random()`
- **Canonicalized config hash** (Section 12) persisted into workflow input, so that the same graph definition always produces the same hash

### 5.4 Fan-Out / Fan-In via Map and Join

The `map` node handles fan-out:

1. Read the collection from `ctx[collectionCtxKey]`
2. For each item, create a parallel execution context (shallow copy of ctx with `itemCtxKey` set to the current item)
3. Execute the body subgraph (from `bodyEntryNodeId` to `bodyExitNodeId`) for each item
4. Respect `maxConcurrency` -- if set, use a semaphore pattern to limit parallel branches

The `join` node handles fan-in:

1. Wait for all (or any, depending on `strategy`) branches from the corresponding `map`
2. Collect the outputs from each branch's `bodyExitNodeId` into an array
3. Store the array in `ctx[resultsCtxKey]`

**Implementation note**: For large collections (hundreds of segments), the map node should use Temporal child workflows per batch to keep the parent workflow's event history bounded. The batch size threshold is configurable (e.g., batch into child workflows for collections > 50 items).

### 5.5 Activity Registry

Activities are registered in the worker by a registry mapping:

```typescript
interface ActivityRegistryEntry {
  activityType: string;           // e.g., "azureOcr.submit"
  activityFn: (...args: unknown[]) => Promise<unknown>;
  defaultTimeout: string;
  defaultRetry: RetryPolicy;
}
```

The graph runner resolves `activityType` from the node definition to the actual activity implementation via this registry. Unknown activity types cause a validation error at graph load time (before execution begins).

Initial registry entries (mapping from graph `activityType` to existing/new activity functions):

| activityType | Maps to | Description |
|---|---|---|
| `document.updateStatus` | `updateDocumentStatus` | Update document status in DB |
| `file.prepare` | `prepareFileData` | Validate and prepare file data |
| `azureOcr.submit` | `submitToAzureOCR` | Submit to Azure Document Intelligence |
| `azureOcr.poll` | `pollOCRResults` | Poll Azure for results |
| `azureOcr.extract` | `extractOCRResults` | Parse Azure response |
| `ocr.cleanup` | `postOcrCleanup` | Text normalization |
| `ocr.checkConfidence` | `checkOcrConfidence` | Calculate confidence |
| `ocr.storeResults` | `upsertOcrResult` | Store OCR results in DB |
| `document.storeRejection` | `storeDocumentRejection` | Store rejection data |
| `document.split` | NEW: `splitDocument` | Split multi-page PDF |
| `document.classify` | NEW: `classifyDocument` | Rule-based classification |
| `sdpr.aggregate` | NEW: `aggregateSdprReport` | SDPR-specific aggregation |

### 5.6 Query and Signal Handlers

The `graphWorkflow` exposes:

**Queries**:
- `getStatus`: Returns `{ currentNodeId, nodeStatuses, overallStatus, ctx }` (ctx may be redacted for large values)
- `getProgress`: Returns `{ completedCount, totalCount, currentNodes, progressPercentage }`

**Signals**:
- `cancel`: `{ mode: "graceful" | "immediate" }` -- same semantics as current system
- Dynamic signal handlers registered by `humanGate` nodes (e.g., `humanApproval`) -- the signal name comes from the node definition

---

## 6. Multi-Page Document Support

### 6.1 Document Splitting

A new `document.split` activity handles PDF splitting:

```typescript
interface SplitDocumentInput {
  blobKey: string;              // Reference to the source PDF
  strategy: "per-page" | "boundary-detection" | "fixed-range";
  fixedRangeSize?: number;      // Pages per segment (for "fixed-range" strategy)
}

interface SplitDocumentOutput {
  segments: DocumentSegment[];
}

interface DocumentSegment {
  segmentIndex: number;
  pageRange: { start: number; end: number };  // 1-based inclusive
  blobKey: string;              // Reference to the split segment file
  pageCount: number;
}
```

**Implementation**: Use `qpdf` (installed as a system dependency) for PDF splitting. The activity:

1. Reads the source PDF from the local filesystem via `blobKey`
2. Determines split points based on the strategy
3. Uses `qpdf` CLI to extract page ranges into separate files
4. Returns segment metadata with blob keys for each split file

**Engineering upper bound**: Must handle documents with at least 2,000 pages.

### 6.2 Boundary Detection (Rule-Based)

For `"boundary-detection"` strategy, the activity performs a two-pass approach:

1. **First pass**: Quick OCR on every page (or sampled pages) to extract text/layout
2. **Second pass**: Apply rule-based heuristics to detect document boundaries:
   - Page 1 indicators: headers, letterheads, "Page 1 of N" markers
   - Common separators: blank pages, barcode sheets
   - Format/layout changes between consecutive pages
   - Configurable custom rules via the `parameters` field

### 6.3 Document Classification

A new `document.classify` activity:

```typescript
interface ClassifyDocumentInput {
  ocrResult: OCRResult;
  segment: DocumentSegment;
  classifierType: "rule-based";
  rules?: ClassificationRule[];
}

interface ClassifyDocumentOutput {
  segmentType: string;          // e.g., "sdpr-monthly-report", "receipt", "invoice"
  confidence: number;
  matchedRule?: string;
}

interface ClassificationRule {
  name: string;
  patterns: {
    field: string;              // "text", "title", "keyValuePair.key", etc.
    operator: "contains" | "matches" | "startsWith";
    value: string;
  }[];
  resultType: string;
}
```

The classifier starts with rule-based heuristics over OCR text and layout. Pattern matching checks for keywords, header patterns, form field names, and structural signatures. ML-based classification is deferred to a future phase.

---

## 7. Data Flow and Context Model

### 7.1 The Hybrid Approach

The workflow uses a **hybrid model** combining a workflow-scoped context store with explicit port bindings:

1. **Runtime context (`ctx`)**: A key-value store (implemented as a plain object) that lives for the duration of the workflow execution. Nodes read from and write to ctx.

2. **Port declarations**: Each node declares its `inputs` (what it reads from ctx) and `outputs` (what it writes to ctx). These are static declarations in the graph JSON.

3. **Edges connect ports**: While edges primarily define execution order, the port bindings on source and target nodes define how data flows. An edge from node A to node B means "B depends on A" -- B's input ports read from ctx keys that A's output ports wrote to.

### 7.2 Context Resolution

When a node executes:

1. **Read inputs**: For each entry in the node's `inputs` array, read `ctx[ctxKey]` and provide it to the activity/handler as the value for `port`
2. **Execute**: Run the activity/evaluation
3. **Write outputs**: For each entry in the node's `outputs` array, write the corresponding result value to `ctx[ctxKey]`

Port bindings support dot notation for nested access: `ctx.currentSegment.blobKey` reads `ctx.currentSegment` and then accesses `.blobKey` on the result.

### 7.3 Context Scoping in Map Nodes

When a `map` node creates parallel branches:

- Each branch gets a **shallow copy** of the parent ctx
- The `itemCtxKey` is set to the current collection item
- The `indexCtxKey` (if specified) is set to the iteration index
- Writes within a branch do NOT affect the parent ctx or other branches
- The `join` node collects specified output values from all branches into the parent ctx

### 7.4 Context Serialization

The ctx object must be JSON-serializable at all times (it flows through Temporal's event history). Large payloads (binary data, full OCR results) should be stored externally (see Section 13) with only references (blob keys, document IDs) kept in ctx.

---

## 8. Frontend Requirements

### 8.1 Pages

The three existing workflow pages are replaced/updated:

#### WorkflowListPage (Updated)

**File**: `apps/frontend/src/pages/WorkflowListPage.tsx`

Changes:
- Same table layout (name, description, version, dates, actions)
- Add a `schemaVersion` badge column
- No functional changes to CRUD operations

#### WorkflowEditorPage (Replaces WorkflowPage + WorkflowEditPage)

**File**: `apps/frontend/src/pages/WorkflowEditorPage.tsx` (new, replaces both existing pages)

A single page for both creating and editing workflows:

**Layout**: Two-panel split view
- **Left panel (50-60%)**: JSON text editor for the graph definition
- **Right panel (40-50%)**: React Flow read-only visualization

**JSON Editor Panel**:
- Use a JSON editor component with syntax highlighting, bracket matching, and error markers. Use CodeMirror editor.
- Show validation errors inline (red underlines) and in a collapsible error panel below the editor
- Support JSON schema-based autocompletion if the chosen editor supports it
- The editor content is the `GraphWorkflowConfig` JSON (the `config` field value stored in the database)

**React Flow Panel**:
- Renders the graph from the JSON editor with debounced auto-sync (300ms debounce after last keystroke)
- Read-only: nodes and edges are not draggable or editable
- Node types rendered with distinct shapes/colors:
  - `activity`: rounded rectangle, blue
  - `switch`: diamond, yellow
  - `map`: parallelogram or rectangle with iteration icon, green
  - `join`: inverse parallelogram or rectangle with merge icon, green
  - `childWorkflow`: rectangle with nested icon, purple
  - `pollUntil`: rectangle with refresh icon, orange
  - `humanGate`: rectangle with person icon, red
- Edge types rendered distinctly:
  - `normal`: solid arrow
  - `conditional`: dashed arrow with label
  - `error`: red dashed arrow
- Auto-layout using dagre or elkjs for node positioning
- Show node label and type on each node
- Show port names on edges if specified

**Metadata Panel** (above the editors):
- Workflow name (text input)
- Workflow description (text input)
- Version badge (read-only, shown in edit mode)

**Toolbar**:
- Save / Create button
- Validate button (runs validation without saving)
- Format JSON button (pretty-print)
- Reset button (revert to last saved state, or empty for new)

### 8.2 WorkflowVisualization Component (Replaced)

Remove `apps/frontend/src/components/workflow/WorkflowVisualization.tsx` entirely. Replace with a React Flow based component:

**File**: `apps/frontend/src/components/workflow/GraphVisualization.tsx`

Props:
```typescript
interface GraphVisualizationProps {
  config: GraphWorkflowConfig | null;  // null when JSON is invalid
  validationErrors?: ValidationError[];
  onNodeClick?: (nodeId: string) => void;  // For future use
}
```

The component:
1. Converts `GraphWorkflowConfig` into React Flow nodes and edges
2. Applies auto-layout (dagre/elkjs)
3. Renders with read-only interaction mode (pan/zoom allowed, no editing)
4. Highlights nodes with validation errors
5. Shows a placeholder message when config is null (invalid JSON)

**Design for future editing**: Use React Flow's built-in node/edge types and handle callbacks. The view-only mode simply doesn't register modification handlers. Enabling editing later means:
- Making nodes draggable
- Adding connection handles to ports
- Wiring up `onConnect`, `onNodeDragStop`, `onEdgesChange` callbacks
- Adding a node palette sidebar

### 8.3 Dependencies

Add to frontend `package.json`:
- `@xyflow/react` -- React Flow library for graph visualization
- `@dagrejs/dagre` or `elkjs` -- auto-layout engine
- A JSON editor component (evaluate options: Monaco Editor, CodeMirror 6, or a lighter-weight option)

### 8.4 Type Changes

Replace `apps/frontend/src/types/workflow.ts`:

```typescript
// Remove old types:
// - StepConfig
// - WorkflowStepsConfig

// Add new types:
// - GraphWorkflowConfig (and all sub-types from Section 4)
// - GraphNode, GraphEdge, PortBinding, etc.
```

### 8.5 API Hook Changes

Update `apps/frontend/src/data/hooks/useWorkflows.ts`:

```typescript
interface WorkflowInfo {
  id: string;
  name: string;
  description: string | null;
  userId: string;
  config: GraphWorkflowConfig;  // Changed from WorkflowStepsConfig
  version: number;
  schemaVersion: string;
  createdAt: string;
  updatedAt: string;
}

interface CreateWorkflowDto {
  name: string;
  description?: string;
  config: GraphWorkflowConfig;  // Changed from WorkflowStepsConfig
}
```

The hook functions (`useWorkflows`, `useWorkflow`, `useCreateWorkflow`, `useUpdateWorkflow`, `useDeleteWorkflow`) keep the same structure -- only the type of `config` changes.

---

## 9. Backend API Changes

### 9.1 Endpoint Changes

The REST API structure remains the same (`/api/workflows` CRUD). Changes are in request/response types and validation:

| Method | Path | Change |
|---|---|---|
| `GET /api/workflows` | Response: `config` is now `GraphWorkflowConfig` |
| `GET /api/workflows/:id` | Response: `config` is now `GraphWorkflowConfig` |
| `POST /api/workflows` | Request body: `config` is now `GraphWorkflowConfig`; validation uses `GraphSchemaValidator` |
| `PUT /api/workflows/:id` | Request body: `config` is now `GraphWorkflowConfig`; validation uses `GraphSchemaValidator` |
| `DELETE /api/workflows/:id` | No change |

### 9.2 Validation

Replace `workflow-validator.ts` with `graph-schema-validator.ts`:

```typescript
interface GraphValidationError {
  path: string;         // JSON path, e.g., "nodes.submitOcr.activityType"
  message: string;
  severity: "error" | "warning";
}

function validateGraphConfig(config: GraphWorkflowConfig): {
  valid: boolean;
  errors: GraphValidationError[];
}
```

Validation rules:

1. **Schema validation**: `schemaVersion` is a recognized version
2. **Node validation**:
   - All node IDs are unique
   - `entryNodeId` exists in `nodes`
   - Entry node has no incoming edges
   - All `activityType` values exist in the activity registry
   - Required fields per node type are present
3. **Edge validation**:
   - All edge IDs are unique
   - Source and target node IDs exist
   - No duplicate edges (same source+target+type)
   - Referenced port names exist on the source/target nodes
4. **Graph structure**:
   - Graph is a valid DAG (no cycles)
   - All nodes are reachable from the entry node
   - All non-terminal nodes have at least one outgoing edge
   - `switch` nodes have edges for all cases plus default
   - `map` nodes reference valid `bodyEntryNodeId` and `bodyExitNodeId`
   - `join` nodes reference a valid `sourceMapNodeId`
5. **Context validation**:
   - All port bindings reference declared ctx keys
   - No write conflicts (two nodes writing to the same ctx key in parallel branches)
6. **Expression validation** (for `switch` conditions):
   - Operators are valid
   - Referenced variables exist in ctx declarations

### 9.3 TemporalClientService Changes

Replace `startOCRWorkflow` with `startGraphWorkflow`:

```typescript
async startGraphWorkflow(
  documentId: string,
  workflowConfigId: string,
  initialCtx: Record<string, unknown>,
): Promise<string> {
  // 1. Look up workflow config from DB
  // 2. Compute config hash
  // 3. Start graphWorkflow with the graph definition and initial ctx
}
```

The method:
1. Loads the `GraphWorkflowConfig` from the `Workflow` table
2. Canonicalizes and hashes the config (see Section 12)
3. Calls `client.workflow.start("graphWorkflow", { args: [{ graph, initialCtx, configHash, runnerVersion }], ... })`

Remove the old `startOCRWorkflow` method and associated backward compatibility code.

### 9.4 DTO Updates

Update `CreateWorkflowDto`:

```typescript
class CreateWorkflowDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsObject()
  config: GraphWorkflowConfig;
}
```

### 9.5 Workflow Types

Replace `apps/backend-services/src/temporal/workflow-types.ts`:

```typescript
export const WORKFLOW_TYPES = {
  GRAPH_WORKFLOW: "graphWorkflow",
} as const;
```

Remove `VALID_WORKFLOW_STEP_IDS` from `workflow-constants.ts` (the concept of a fixed step ID list no longer applies -- activity types are registered dynamically).

Replace with an activity type registry constant:

```typescript
export const ACTIVITY_REGISTRY: Record<string, { description: string }> = {
  "document.updateStatus": { description: "Update document status in database" },
  "file.prepare": { description: "Validate and prepare file data" },
  "azureOcr.submit": { description: "Submit to Azure Document Intelligence" },
  "azureOcr.poll": { description: "Poll Azure for OCR results" },
  "azureOcr.extract": { description: "Extract structured OCR data" },
  "ocr.cleanup": { description: "Post-OCR text normalization" },
  "ocr.checkConfidence": { description: "Calculate OCR confidence" },
  "ocr.storeResults": { description: "Store OCR results in database" },
  "document.storeRejection": { description: "Store document rejection data" },
  "document.split": { description: "Split multi-page PDF into segments" },
  "document.classify": { description: "Classify document type (rule-based)" },
  "sdpr.aggregate": { description: "Aggregate SDPR report segments" },
};
```

---

## 10. Database Changes

### 10.1 Workflow Table

The `Workflow` model schema stays the same. The `config` JSONB column now stores `GraphWorkflowConfig` instead of `WorkflowStepsConfig`:

```prisma
model Workflow {
  id          String   @id @default(cuid())
  name        String
  description String?
  user_id     String
  config      Json     // GraphWorkflowConfig stored as JSONB (was WorkflowStepsConfig)
  version     Int      @default(1)
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt

  @@map("workflows")
}
```

No Prisma migration needed for the table structure -- the `Json` column accepts any valid JSON. However, existing data in the `config` column uses the old format and will not be compatible (clean break, per requirements).

### 10.2 Document Table

No changes to the `Document` model. The `workflow_config_id` still references a `Workflow.id` and `workflow_execution_id` still stores the Temporal execution ID.

### 10.3 Data Cleanup

Existing workflow records in the `workflows` table use the old `WorkflowStepsConfig` format. Since there is no backward compatibility:

- A one-time manual cleanup or a simple migration script can delete existing workflow records
- Alternatively, leave them in the database but the new UI/API will reject them if loaded (validation will fail against the new schema)
- Document this in release notes

---

## 11. Error Handling

### 11.1 Per-Node Error Policies

Each node can define an optional `errorPolicy`:

```typescript
interface ErrorPolicy {
  retryable: boolean;           // Whether the error is retryable by Temporal
  fallbackEdgeId?: string;      // Edge ID to follow on failure (must be type "error")
  maxRetries?: number;          // Override node-level retry (for activity nodes)
  onError: "fail" | "fallback" | "skip";
}
```

Behavior:
- `"fail"` (default): The node failure propagates to the workflow, which fails
- `"fallback"`: The graph runner follows the `fallbackEdgeId` edge instead of failing. This is represented as an explicit `error` type edge in the graph.
- `"skip"`: The node is marked as skipped and execution continues to the next node(s). Output ports are not written (ctx keys retain their previous values or defaults).

### 11.2 Fallback Edge Example

A common pattern: on OCR failure, route to human review:

```json
{
  "nodes": {
    "submitOcr": {
      "type": "activity",
      "activityType": "azureOcr.submit",
      "errorPolicy": {
        "onError": "fallback",
        "fallbackEdgeId": "edge-ocr-error-to-review"
      }
    },
    "humanReview": {
      "type": "humanGate",
      "signal": { "name": "manualProcessing" },
      "timeout": "48h",
      "onTimeout": "fail"
    }
  },
  "edges": [
    { "id": "edge-ocr-error-to-review", "source": "submitOcr", "target": "humanReview", "type": "error" }
  ]
}
```

### 11.3 Temporal Error Types

The graph runner uses Temporal's `ApplicationFailure` to distinguish error categories:

- **Retryable errors**: Activity failures that Temporal should retry (network errors, transient Azure API failures). These use the default Temporal retry behavior based on the node's `retry` configuration.
- **Non-retryable errors**: Business logic failures (invalid document, human rejection, timeout). Created with `ApplicationFailure.create({ nonRetryable: true, type: "..." })`.

Error type strings for `ApplicationFailure`:
- `GRAPH_VALIDATION_ERROR` -- graph config failed validation at execution time
- `ACTIVITY_NOT_FOUND` -- unknown activity type in registry
- `HUMAN_GATE_TIMEOUT` -- human gate timed out
- `HUMAN_GATE_REJECTED` -- human reviewer rejected
- `POLL_TIMEOUT` -- pollUntil exceeded max attempts or timeout
- `CYCLE_DETECTED` -- graph has a cycle (should be caught at validation, but defensive check)
- `CTX_KEY_MISSING` -- required ctx key not present at runtime

### 11.4 Error Reporting in Queries

The `getStatus` query returns error information:

```typescript
interface GraphWorkflowStatus {
  overallStatus: "running" | "completed" | "failed" | "cancelled";
  currentNodes: string[];       // Node IDs currently executing
  nodeStatuses: Record<string, {
    status: "pending" | "running" | "completed" | "failed" | "skipped";
    error?: string;
    startedAt?: string;
    completedAt?: string;
  }>;
  lastError?: {
    nodeId: string;
    message: string;
    type: string;
    retryable: boolean;
  };
}
```

---

## 12. Versioning and Replay Safety

### 12.1 Version Fields

Three version dimensions:

1. **`schemaVersion`** (in `GraphWorkflowConfig`): The version of the graph JSON schema format. Starts at `"1.0"`. Bumped when the schema structure changes (e.g., new required fields, changed semantics). The graph runner checks this on load and rejects unrecognized versions.

2. **`runnerVersion`** (in `GraphWorkflowInput`): The version of the graph execution engine code. Persisted into the workflow input so that replay can detect version mismatches. Format: semver string (e.g., `"1.0.0"`). Bumped when the execution semantics change (e.g., different topological sort algorithm, new node type execution logic).

3. **`Workflow.version`** (in database): Existing per-record version counter. Incremented when the `config` content changes (same behavior as current system -- detected via stable stringify comparison).

### 12.2 Config Hash

A SHA-256 hash of the canonicalized graph config is computed and stored in the workflow input:

```typescript
function computeConfigHash(config: GraphWorkflowConfig): string {
  // 1. Deep clone the config
  // 2. Apply defaults (fill in all optional fields with their default values)
  // 3. Stable stringify (sort keys recursively)
  // 4. SHA-256 hash
  // 5. Return hex string
}
```

This hash is included in `GraphWorkflowInput.configHash`. It serves two purposes:

1. **Integrity check**: On replay, the runner can verify the config matches the original execution
2. **Deduplication**: Two semantically identical configs (differing only in key order or missing defaults) produce the same hash

### 12.3 Replay Safety

Temporal replays workflows by re-executing the workflow function against the recorded event history. The graph runner must ensure deterministic execution:

- **Stable topological sort**: Same graph always produces same execution order
- **No side effects**: The graph runner itself performs no I/O -- all I/O is delegated to activities
- **Version checking**: On replay, if `runnerVersion` in the input differs from the current runner version, log a warning. If the difference is a major version change, fail the replay with a clear error message.
- **Activity type registry**: The registry must be append-only in patch/minor versions. Removing or changing an activity type's semantics requires a major version bump.

### 12.4 Node-Type Registry Version

The activity registry is versioned alongside the runner. When new activity types are added (minor version bump) or existing ones change signature (major version bump), the runner version reflects this. The graph schema's `activityType` values are validated against the registry at both save time (backend) and execution time (worker).

---

## 13. External Payload Storage

### 13.1 Problem

The current system passes base64-encoded file data directly in the Temporal workflow input (`OCRWorkflowInput.binaryData`). This is problematic for:

- Large files (Temporal has a 2MB payload limit per event by default, though configurable)
- Multi-page documents (2,000 pages could easily exceed limits)
- Workflow history bloat (every activity input/output is recorded)

### 13.2 Solution: Blob References

Instead of inline data, the workflow input contains **blob keys** that reference files on the storage backend:

```typescript
interface BlobReference {
  blobKey: string;              // Unique key, e.g., "documents/{documentId}/original.pdf"
  storageBackend: "local";      // Future: "azure-blob", "s3"
}
```

### 13.3 Storage Interface

A thin abstraction layer for blob storage:

```typescript
interface BlobStorageService {
  write(key: string, data: Buffer): Promise<void>;
  read(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}
```

For the initial implementation, only `LocalBlobStorageService` is needed:

```typescript
class LocalBlobStorageService implements BlobStorageService {
  constructor(private basePath: string) {}  // e.g., "./data/blobs"
  // Implements read/write/exists/delete using fs operations
}
```

### 13.4 Upload Flow Change

Current:
```
Upload -> base64 encode -> pass in Temporal workflow input -> activity decodes base64
```

New:
```
Upload -> save to filesystem -> store blobKey in document record -> pass blobKey in workflow ctx -> activity reads from filesystem via blobKey
```

### 13.5 Segment Storage

When `document.split` creates segments, each segment is written to the filesystem with its own blob key:

```
documents/{documentId}/original.pdf
documents/{documentId}/segments/segment-001-pages-1-5.pdf
documents/{documentId}/segments/segment-002-pages-6-12.pdf
...
```

---

## 14. Expression Language

### 14.1 Structured Operator DSL

Switch conditions and pollUntil conditions use a structured operator DSL:

```typescript
type ConditionExpression =
  | ComparisonExpression
  | LogicalExpression
  | NotExpression
  | NullCheckExpression
  | ListMembershipExpression;

interface ComparisonExpression {
  operator: "equals" | "not-equals" | "gt" | "gte" | "lt" | "lte" | "contains";
  left: ValueRef;
  right: ValueRef;
}

interface LogicalExpression {
  operator: "and" | "or";
  operands: ConditionExpression[];
}

interface NotExpression {
  operator: "not";
  operand: ConditionExpression;
}

interface NullCheckExpression {
  operator: "is-null" | "is-not-null";
  value: ValueRef;
}

interface ListMembershipExpression {
  operator: "in" | "not-in";
  value: ValueRef;
  list: ValueRef;  // Must resolve to an array
}

type ValueRef =
  | { ref: string }       // Reference to a ctx value, e.g., "ctx.requiresReview"
  | { literal: unknown }; // Literal value, e.g., true, 42, "succeeded"
```

### 14.2 Variable Namespaces

References in `ValueRef.ref` support these namespaces:

- `ctx.<key>` -- workflow context value
- `ctx.<key>.<nestedKey>` -- nested property access (dot notation)
- `doc.<field>` -- shorthand for `ctx.documentMetadata.<field>` (convenience alias)
- `segment.<field>` -- shorthand for `ctx.currentSegment.<field>` (within map body)

### 14.3 Evaluation Semantics

- **Type coercion**: No implicit type coercion. `equals` uses strict equality. Comparing a string to a number is always false.
- **Null handling**: `null` and `undefined` are treated as equivalent (both represent "missing"). `is-null` returns true for both.
- **String contains**: Case-sensitive. For case-insensitive matching, a future enhancement can add a `contains-ci` operator.
- **Nested access**: If any intermediate property is null/undefined, the entire ref evaluates to null. This does not throw an error -- it allows `is-null` checks to work naturally.
- **Short-circuit evaluation**: `and` stops at the first false; `or` stops at the first true.

### 14.4 Examples

**Simple equality check:**
```json
{
  "operator": "equals",
  "left": { "ref": "ctx.requiresReview" },
  "right": { "literal": true }
}
```

**Confidence threshold with AND:**
```json
{
  "operator": "and",
  "operands": [
    {
      "operator": "lt",
      "left": { "ref": "ctx.averageConfidence" },
      "right": { "literal": 0.95 }
    },
    {
      "operator": "is-not-null",
      "value": { "ref": "ctx.averageConfidence" }
    }
  ]
}
```

**Document type classification routing:**
```json
{
  "operator": "in",
  "value": { "ref": "ctx.segmentType" },
  "list": { "literal": ["invoice", "receipt", "purchase-order"] }
}
```

### 14.5 Future: CEL Integration

The `ConditionExpression` type will be extended in a future phase with a CEL (Common Expression Language) option:

```typescript
type ConditionExpression =
  | ComparisonExpression
  | LogicalExpression
  | NotExpression
  | NullCheckExpression
  | ListMembershipExpression
  | CelExpression;  // Future

interface CelExpression {
  cel: string;  // CEL expression string, e.g., "ctx.confidence < 0.95 && ctx.pageCount > 10"
}
```

The structured DSL and CEL would be interchangeable in switch conditions. The frontend JSON editor would support both, with the structured DSL as default and CEL as "advanced mode."

---

## 15. Test Cases

### 15.1 Graph Schema Validation Tests

| Test | Description |
|---|---|
| Valid simple graph | Linear 3-node graph passes validation |
| Valid branching graph | Switch node with two cases and default passes |
| Valid map/join graph | Map and join pair with body nodes passes |
| Missing entry node | Validation fails: `entryNodeId` not in `nodes` |
| Cycle detection | A -> B -> C -> A fails with cycle error |
| Unknown activity type | Node with `activityType: "nonexistent"` fails |
| Orphan node | Node not reachable from entry fails with warning |
| Duplicate node IDs | Two nodes with same ID fails |
| Duplicate edge IDs | Two edges with same ID fails |
| Missing switch default | Switch without `defaultEdge` fails |
| Invalid expression | Condition with unknown operator fails |
| Port binding to undeclared ctx key | Input port referencing non-existent ctx key fails |
| Empty graph | No nodes fails |
| Single node graph | Only entry node, no edges, passes |

### 15.2 Graph Runner Execution Tests

| Test | Description |
|---|---|
| Linear execution | 3 activity nodes execute in order, ctx values flow correctly |
| Switch routing true case | Switch evaluates true condition, follows correct edge |
| Switch routing default | No case matches, follows default edge |
| Map fan-out fan-in | Map over 3 items, each runs a body activity, join collects all results |
| Map with maxConcurrency | Map over 10 items with maxConcurrency=3, verifies no more than 3 run simultaneously |
| PollUntil success | Poll activity returns "running" twice then "succeeded", condition met |
| PollUntil timeout | Poll exceeds maxAttempts, throws POLL_TIMEOUT |
| HumanGate approval | Signal received before timeout, workflow continues |
| HumanGate rejection | Rejection signal received, workflow fails with HUMAN_GATE_REJECTED |
| HumanGate timeout | No signal within timeout, behaves per onTimeout policy |
| Error fallback | Activity fails, follows error edge to humanGate |
| Error skip | Activity fails with skip policy, next node executes |
| Error fail | Activity fails with fail policy, workflow fails |
| Cancel graceful | Cancel signal during activity, completes current then stops |
| Cancel immediate | Cancel signal during activity, stops immediately |
| ChildWorkflow | Node starts child graphWorkflow, waits for result, maps output to parent ctx |
| Deterministic ordering | Same graph produces identical execution order across multiple runs |

### 15.3 SDPR End-to-End Test

| Step | Description |
|---|---|
| 1 | Upload a 50-page SDPR PDF with known structure (3 distinct document types) |
| 2 | `document.split` produces correct segments (validates page ranges) |
| 3 | Map fan-out spawns OCR for each segment |
| 4 | Each segment OCR runs the standard OCR child workflow |
| 5 | `document.classify` correctly identifies each segment type |
| 6 | Join collects all segment results |
| 7 | `sdpr.aggregate` produces the consolidated report |
| 8 | Results stored in database with correct associations |

### 15.4 Multi-Page Stress Test

| Test | Description |
|---|---|
| 100-page document | Split and process 100 pages, verify all segments processed |
| 500-page document | Verify chunking/batching into child workflows works |
| 2000-page document | Verify the system handles the engineering upper bound |

### 15.5 Frontend Tests

| Test | Description |
|---|---|
| JSON editor renders | Editor loads with empty/default graph config |
| JSON edit updates visualization | Type valid JSON, React Flow updates after debounce |
| Invalid JSON shows error | Malformed JSON shows error indicator, visualization shows placeholder |
| Validation errors shown | Invalid graph config shows inline errors |
| Create workflow | Save new workflow via API, appears in list |
| Edit workflow | Load existing workflow, modify, save, version increments |
| Delete workflow | Delete from list, confirmation modal works |
| Node types render correctly | Each node type has distinct visual representation |
| Edge types render correctly | Normal, conditional, error edges have distinct styles |

### 15.6 Replay and Determinism Tests

| Test | Description |
|---|---|
| Replay succeeds | Record workflow history, replay produces identical result |
| Version mismatch warning | Replay with different runnerVersion logs warning |
| Config hash matches | Config hash in input matches recomputed hash |
| Stable topo sort | Same graph always produces same node execution order |

---

## 16. Future Phase: Visual Editor

This section describes the planned visual drag-and-drop editor that will be built in a later phase. The current implementation (JSON editor + read-only React Flow) is designed so these additions require minimal structural changes.

### Planned Capabilities

1. **Drag and drop nodes** from a palette sidebar onto the canvas
2. **Connect nodes** by dragging from output port handles to input port handles
3. **Edit node properties** via a side panel (activity type, parameters, ports, error policy)
4. **Edit edge properties** (condition expressions for switch cases)
5. **Delete nodes and edges** via keyboard shortcut or context menu
6. **Auto-layout** and manual position override
7. **Undo/redo** history
8. **Two-way sync** between visual editor and JSON editor (edit in either, other updates)

### What the Current Implementation Must Provide

- React Flow components that accept modification callbacks (`onConnect`, `onNodesChange`, `onEdgesChange`)
- Node components that render port handles (even if not interactive yet)
- A graph-to-JSON and JSON-to-graph bidirectional conversion utility
- Node type components as custom React Flow node types (so visual properties are established)

### What Will Be Added Later

- Node palette sidebar component
- Property editor panel component
- Connection validation logic (prevent invalid edges)
- Undo/redo state management
- Two-way sync controller between editor modes

---

## 17. Migration Strategy

### 17.1 Approach: Clean Break

No automated migration of old workflow configs. This is justified because:

- The old format (`WorkflowStepsConfig`) is fundamentally different from the new graph schema
- There is a small number of existing workflow configurations (users can recreate them)
- The old format maps to a single specific graph (the standard OCR workflow), which can be provided as a template

### 17.2 Migration Steps

1. **Database**: No schema migration needed (the `config` JSONB column accepts any JSON). Optionally run a cleanup script to delete old workflow records, or leave them (they will fail validation if loaded).

2. **Backend code**:
   - Replace `WorkflowStepsConfig` types with `GraphWorkflowConfig` types
   - Replace `workflow-validator.ts` with `graph-schema-validator.ts`
   - Replace `startOCRWorkflow` with `startGraphWorkflow` in `TemporalClientService`
   - Update `WorkflowService` to validate against the new schema
   - Remove all backward-compatibility code (wrapped "steps" key handling, etc.)
   - Remove `VALID_WORKFLOW_STEP_IDS` constant

3. **Temporal worker**:
   - Add `graphWorkflow` function alongside `ocrWorkflow` (keep `ocrWorkflow` temporarily for any in-flight executions)
   - Implement the graph runner, activity registry, expression evaluator
   - Register `graphWorkflow` in the worker
   - After all in-flight `ocrWorkflow` executions complete, remove `ocrWorkflow`

4. **Frontend**:
   - Replace `WorkflowPage` and `WorkflowEditPage` with `WorkflowEditorPage`
   - Replace `WorkflowVisualization` with `GraphVisualization`
   - Update types and API hooks
   - Remove all old form-based workflow builder code

5. **Provide templates**: Create a "Standard OCR Workflow" template (the graph equivalent of the old 11-step workflow, as shown in Section 4.4) and optionally an "SDPR Multi-Page" template. These can be seeded into the database or provided as importable JSON files.

### 17.3 In-Flight Workflow Handling

During the transition:

1. Keep `ocrWorkflow` registered in the worker for a transition period
2. New workflow executions use `graphWorkflow`
3. Monitor for any in-flight `ocrWorkflow` executions via Temporal UI
4. Once all old executions have completed (or timed out), remove `ocrWorkflow` from the worker code

### 17.4 Rollout Sequence

1. Implement and test the graph runner with unit and integration tests
2. Implement the new frontend (JSON editor + React Flow)
3. Implement backend validation and API changes
4. Deploy backend + worker with both old and new workflow types
5. Deploy frontend (breaks old workflow creation/editing)
6. Monitor for in-flight old workflows
7. Remove old workflow code after transition period

---

## Appendix A: File Changes Summary

### Files to Remove

| File | Reason |
|---|---|
| `apps/frontend/src/pages/WorkflowPage.tsx` | Replaced by WorkflowEditorPage |
| `apps/frontend/src/pages/WorkflowEditPage.tsx` | Replaced by WorkflowEditorPage |
| `apps/frontend/src/components/workflow/WorkflowVisualization.tsx` | Replaced by GraphVisualization |
| `apps/temporal/src/workflow-config.ts` | DEFAULT_WORKFLOW_STEPS and mergeWorkflowConfig no longer needed |
| `apps/temporal/src/workflow-config-validator.ts` | Replaced by graph schema validator |
| `apps/backend-services/src/workflow/workflow-validator.ts` | Replaced by graph schema validator |
| `apps/backend-services/src/temporal/workflow-constants.ts` | VALID_WORKFLOW_STEP_IDS no longer needed |

### Files to Create

| File | Purpose |
|---|---|
| `apps/frontend/src/pages/WorkflowEditorPage.tsx` | Combined create/edit page with JSON editor + React Flow |
| `apps/frontend/src/components/workflow/GraphVisualization.tsx` | React Flow based graph visualization |
| `apps/frontend/src/types/graph-workflow.ts` | GraphWorkflowConfig and all sub-types |
| `apps/temporal/src/graph-workflow.ts` | graphWorkflow function and runner |
| `apps/temporal/src/graph-runner.ts` | Core DAG execution engine |
| `apps/temporal/src/activity-registry.ts` | Activity type registry |
| `apps/temporal/src/expression-evaluator.ts` | Condition expression evaluator |
| `apps/temporal/src/graph-schema-validator.ts` | Graph config validator (used at execution time) |
| `apps/backend-services/src/workflow/graph-schema-validator.ts` | Graph config validator (used at save time) |
| `apps/backend-services/src/workflow/graph-workflow-types.ts` | Shared types for graph workflow |
| `apps/backend-services/src/blob-storage/blob-storage.service.ts` | Blob storage abstraction |
| `apps/backend-services/src/blob-storage/local-blob-storage.service.ts` | Local filesystem implementation |
| `apps/temporal/src/activities/split-document.ts` | PDF splitting activity |
| `apps/temporal/src/activities/classify-document.ts` | Document classification activity |

### Files to Modify

| File | Change |
|---|---|
| `apps/frontend/src/types/workflow.ts` | Replace WorkflowStepsConfig with import from graph-workflow.ts |
| `apps/frontend/src/data/hooks/useWorkflows.ts` | Change config type to GraphWorkflowConfig |
| `apps/frontend/src/pages/WorkflowListPage.tsx` | Add schemaVersion column |
| `apps/frontend/src/App.tsx` | Update route to WorkflowEditorPage |
| `apps/backend-services/src/workflow/workflow.service.ts` | Use GraphWorkflowConfig type, new validator |
| `apps/backend-services/src/workflow/workflow.controller.ts` | Updated DTOs |
| `apps/backend-services/src/workflow/workflow-types.ts` | Replace with GraphWorkflowConfig types |
| `apps/backend-services/src/workflow/dto/create-workflow.dto.ts` | Change config type |
| `apps/backend-services/src/temporal/temporal-client.service.ts` | Replace startOCRWorkflow with startGraphWorkflow |
| `apps/backend-services/src/temporal/workflow-types.ts` | Replace WORKFLOW_TYPES |
| `apps/temporal/src/worker.ts` | Register graphWorkflow, add new activities |
| `apps/temporal/src/types.ts` | Add graph workflow types |
| `apps/temporal/src/activities.ts` | Refactor into activity registry pattern |
