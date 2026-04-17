# Workflow Builder Guide

This document serves as the design reference for the visual workflow builder interface. It describes what users can build, how the pieces fit together, and the rules the system enforces — all from the perspective of someone dragging nodes onto a canvas and wiring them together.

---

## How Workflows Work

A workflow is a pipeline of steps that processes documents. You build one by placing **nodes** on a canvas and connecting them with **edges**. When a document enters the workflow, the engine starts at the first node and follows the connections, executing each step in order. Where the path splits, the engine can run branches in parallel or choose a path based on conditions.

Every workflow has a **context** — a shared data store that nodes read from and write to as the workflow runs. Think of it as a set of named variables (like `documentId`, `ocrResult`, `confidenceScore`) that flow through the pipeline. Each node declares what it reads and what it produces.

---

## The Canvas

The builder canvas is where you assemble your workflow visually. It should feel familiar if you've used tools like n8n, Make.com, or similar automation platforms.

### Core Interactions

- **Add nodes** from a sidebar palette, organized by category
- **Connect nodes** by dragging from one node's output handle to another node's input handle
- **Configure nodes** by clicking them to open a settings panel
- **Pan and zoom** the canvas to navigate large workflows
- **Select and delete** nodes or connections
- **Auto-layout** to tidy up the canvas arrangement

### Validation

The builder validates your workflow in real time as you build:

- A node with missing required configuration shows a warning badge
- An invalid connection (creating a cycle, for example) is rejected
- Unconnected nodes are flagged
- The entry point must be set (the first node in your workflow)

---

## Node Types

There are seven types of nodes, each with a distinct visual shape and purpose.

### Activity

**Visual:** Rounded rectangle, blue

The workhorse of any workflow. An activity node runs a single operation — calling an external service, transforming data, updating a database record. You pick the operation from a dropdown of available activities (see the Activity Catalog below), then configure its inputs and parameters.

**Configuration:**

| Field | Description |
|---|---|
| Activity type | Which operation to run (selected from catalog) |
| Parameters | Static settings specific to the chosen activity (e.g., which OCR model to use, a confidence threshold) |
| Input bindings | Which context variables to feed into this activity |
| Output bindings | Which context variables this activity writes its results to |
| Timeout | How long to wait before considering this step failed |
| Retry policy | How many times to retry on failure, with backoff settings |

**When to use:** Any time you need to do something concrete — prepare a file, call OCR, clean up results, store data.

---

### Switch (Conditional Branch)

**Visual:** Diamond shape, yellow

Routes the workflow down different paths based on a condition. Think of it as an if/else or a multi-way branch. You define one or more conditions that are evaluated in order; the first one that matches determines which path the workflow follows. A default path catches everything else.

**Configuration:**

| Field | Description |
|---|---|
| Cases | An ordered list of conditions, each pointing to a different outgoing connection |
| Default path | The connection to follow if no conditions match |

Each case has a condition built from:
- A **left value** — a reference to a context variable (e.g., "the value of `requiresReview`")
- An **operator** — equals, not-equals, greater-than, less-than, contains, etc.
- A **right value** — either another context variable or a fixed value (e.g., `true`, `0.95`, `"monthly-report"`)

**When to use:** Routing based on OCR confidence scores, document types, approval flags, or any data-driven decision point.

**Example scenarios:**
- "If confidence is below threshold, route to human review; otherwise, store results directly."
- "Route to different processing paths based on the classified document type."

---

### Map (Fan-Out / Loop)

**Visual:** Rounded rectangle with a loop/iteration icon, green

Takes a list of items from the context and runs a sub-workflow for each one, in parallel. This is how you process multiple pages, segments, or documents at once. You define the body of the loop by connecting nodes between the Map node's internal start and end points.

**Configuration:**

| Field | Description |
|---|---|
| Collection | Which context variable holds the list to iterate over |
| Item variable | The name of the context variable that holds the current item inside each iteration |
| Index variable | (Optional) The name of the variable holding the current iteration number |
| Max concurrency | (Optional) Limit how many items process simultaneously. Leave blank for no limit |
| Body start node | The first node inside the loop body |
| Body end node | The last node inside the loop body (results are collected from here) |

**When to use:** Processing the pages of a split document in parallel, running OCR on multiple segments simultaneously, applying the same operation to a batch of items.

**Visual behavior on canvas:** The Map node should visually contain or frame its body nodes, making it clear which nodes run inside the loop versus outside it.

---

### Join (Fan-In / Collect)

**Visual:** Rounded rectangle with a merge/collect icon, green

The counterpart to Map. Waits for all (or any) parallel branches to finish, then collects their results into a single list in the context.

**Configuration:**

| Field | Description |
|---|---|
| Source Map node | Which Map node's branches to collect from |
| Strategy | **All** — wait for every branch to complete; **Any** — continue as soon as the first branch succeeds |
| Results variable | The context variable where the collected array of results is stored |

**When to use:** Always paired with a Map node. Place it after the Map to gather results before continuing to the next stage (e.g., validation, aggregation).

---

### Child Workflow

**Visual:** Rectangle with a nested/sub-workflow icon, purple

Runs an entire other workflow as a single step. This is how you build reusable, composable pipelines. For example, a "Standard OCR" workflow can be saved as a library workflow and then invoked from inside a larger multi-page processing workflow.

**Configuration:**

| Field | Description |
|---|---|
| Workflow reference | Pick an existing workflow from the library |
| Input mappings | Which context variables from the parent workflow to pass into the child |
| Output mappings | Which results from the child workflow to write back into the parent context |

**When to use:** Reusing a standardized pipeline (like OCR processing) as a building block inside more complex workflows. Keeps things modular — update the child workflow once and every parent that references it picks up the change.

---

### Poll Until (Wait and Retry)

**Visual:** Rounded rectangle with a refresh/clock icon, orange

Repeatedly runs an activity until a condition is met. Used when you need to wait for an external process to finish — like waiting for Azure OCR to complete processing.

**Configuration:**

| Field | Description |
|---|---|
| Activity type | Which operation to run each poll cycle |
| Condition | When to stop polling (same condition builder as Switch) |
| Interval | Time between each poll attempt (e.g., 10 seconds) |
| Initial delay | (Optional) Wait time before the first poll |
| Max attempts | (Optional) Maximum number of polls before giving up. Defaults to 100 |
| Overall timeout | (Optional) Hard time limit for the entire poll cycle |
| Parameters | Static settings for the polled activity |
| Input/output bindings | Context variable mappings, same as Activity |

**When to use:** Waiting for asynchronous external processes — OCR processing, file conversion, any operation where you submit a request and later check for results.

---

### Human Gate (Approval / Pause)

**Visual:** Rounded rectangle with a person icon, red

Pauses the workflow and waits for a human to take action — approve, reject, or provide additional input. The workflow resumes when the signal is received or when the timeout expires.

**Configuration:**

| Field | Description |
|---|---|
| Signal name | A unique name for this approval request (e.g., "humanApproval") |
| Expected payload | (Optional) What data the human reviewer can provide (e.g., approved/rejected flag, comments, annotations) |
| Timeout | How long to wait for a response (e.g., 24 hours) |
| On timeout | What happens if nobody responds: **Fail** the workflow, **Continue** as if approved, or **Fallback** to an alternative path |
| Fallback path | (Only if timeout action is "Fallback") Which connection to follow on timeout |

**When to use:** Quality gates where low-confidence results need human review, approval steps before storing or releasing processed results, any step requiring manual intervention.

---

## Connections (Edges)

Connections define the order nodes execute in and how data flows between them. There are three types:

| Type | Visual | Description |
|---|---|---|
| **Normal** | Solid arrow | Standard sequential flow from one node to the next |
| **Conditional** | Dashed arrow with a label | Used by Switch nodes to represent each branch. The label shows which condition triggers this path |
| **Error** | Red dashed arrow | Fallback path that activates when a node fails. Only available on nodes with an error handling policy configured |

### Connection Rules

- Connections go one way (no backward loops — cycles are not allowed)
- Every node except the final one(s) must have at least one outgoing connection
- The entry node cannot have incoming connections
- Switch nodes need one outgoing connection per case, plus one for the default
- Map and Join nodes are always paired

---

## Context Variables

The context is the shared memory of a running workflow. You define variables at the workflow level and then bind them to node inputs and outputs.

### Defining Variables

At the workflow level, you declare context variables with:

| Property | Description |
|---|---|
| Name | A unique identifier (e.g., `documentId`, `ocrResult`, `confidenceScore`) |
| Type | The data type: text, number, true/false, object, or list |
| Description | (Optional) A human-readable explanation of what this variable holds |
| Default value | (Optional) The initial value if none is provided at runtime |

### How Data Flows

1. When a workflow starts, context variables are initialized from defaults and from the data that triggered the workflow (like a document ID and file reference)
2. As each node executes, it reads its declared inputs from the context
3. After a node completes, it writes its results to the context via its declared outputs
4. The next node in the chain can then read those results

### Nested Access

Context variable references support dot notation for accessing nested data. For example, if `currentSegment` is an object containing a `blobKey` field, you can reference it as `currentSegment.blobKey` in an input binding.

### Scoping Inside Loops

Inside a Map loop, each parallel iteration gets its own copy of the context. Changes made inside one iteration don't affect other iterations or the parent workflow. The Join node is the only way to bring results back out of the loop into the main context.

---

## Error Handling

Each node can optionally have an error handling policy.

### Error Policy Options

| Option | Behavior |
|---|---|
| **Retry then fail** | Retry according to the retry policy, then fail the workflow if all retries are exhausted. This is the default. |
| **Retry then fallback** | Retry, and if all retries fail, follow the error connection to an alternative node instead of failing the entire workflow |
| **Skip** | If the node fails, mark it as skipped and continue to the next node |

Fallback paths (via error connections) are useful for routing failures to human review or alternative processing. For example, if OCR extraction fails, you could route to a Human Gate for manual data entry.

---

## Node Groups

Nodes can be organized into visual groups on the canvas. Groups are cosmetic — they don't affect execution — but they help users understand the structure of complex workflows.

Each group has:

| Property | Description |
|---|---|
| Label | Display name (e.g., "OCR Extraction", "Quality Gate") |
| Description | Brief explanation of what this group of nodes does |
| Color | A color for the group background |
| Icon | A representative icon |
| Member nodes | Which nodes belong to this group |
| Exposed parameters | Parameters from member nodes that should be surfaced for easy override when this workflow is used in benchmark runs |

Groups can also expose parameters — this means when someone uses this workflow as part of a benchmark definition, they can override specific settings (like which OCR model to use, or the confidence threshold) without editing the workflow itself.

---

## Activity Catalog

These are the operations available for Activity and Poll Until nodes. They're organized by category.

### File Operations

| Activity | Description |
|---|---|
| **Prepare File Data** (`file.prepare`) | Validates and prepares file metadata for processing. Takes file reference, name, type, and content type. Produces prepared data for OCR submission. |

### OCR Processing

| Activity | Description |
|---|---|
| **Submit to Azure OCR** (`azureOcr.submit`) | Sends a prepared document to Azure Document Intelligence for processing. Produces a request ID for tracking. |
| **Poll OCR Results** (`azureOcr.poll`) | Checks whether Azure OCR processing has completed. Returns the current status and results when done. Used inside a Poll Until node. |
| **Extract OCR Results** (`azureOcr.extract`) | Parses the raw Azure response into a structured OCR result with fields, key-value pairs, and confidence scores. |

### Post-Processing

| Activity | Description |
|---|---|
| **Post-OCR Cleanup** (`ocr.cleanup`) | Normalizes and cleans up raw OCR output — fixes whitespace, standardizes formatting. |
| **Enrich OCR Results** (`ocr.enrich`) | Enriches OCR results using field schemas and optional LLM processing. |
| **Check Confidence** (`ocr.checkConfidence`) | Calculates average confidence across OCR fields and flags whether the result needs human review based on a configurable threshold. |

### OCR Correction Tools

| Activity | Description |
|---|---|
| **Spellcheck** (`ocr.spellcheck`) | Dictionary-based spellcheck on OCR field values. Configurable language and field scope. |
| **Character Confusion** (`ocr.characterConfusion`) | Fixes common OCR misreads (O to 0, l to 1, S to 5, etc.) using a confusion map. Configurable map overrides and field scope. |
| **Normalize Fields** (`ocr.normalizeFields`) | Cleans up field values — whitespace normalization, digit grouping, date separator standardization. Configurable per-rule enable/disable. |

### Document Management

| Activity | Description |
|---|---|
| **Update Status** (`document.updateStatus`) | Updates a document's processing status in the database (e.g., to "ongoing OCR"). |
| **Store Results** (`ocr.storeResults`) | Saves processed OCR results to the database. |
| **Store Rejection** (`document.storeRejection`) | Records rejection data when a document fails processing or review. |

### Multi-Page Document Processing

| Activity | Description |
|---|---|
| **Split Document** (`document.split`) | Splits a multi-page PDF into segments. Strategies: per-page, boundary detection (automatic header/separator recognition), or fixed page ranges. |
| **Split and Classify** (`document.splitAndClassify`) | Combines splitting and classification in one step — splits the document based on OCR keyword markers and assigns a document type to each segment. |
| **Classify Document** (`document.classify`) | Classifies a document segment's type using rule-based pattern matching on OCR text. |
| **Validate Fields** (`document.validateFields`) | Validates fields across related document segments — arithmetic checks (does gross pay minus deductions equal net pay?), cross-document field matching, and array matching. |
| **Combine Segment Result** (`segment.combineResult`) | Merges segment metadata with its OCR result into a single object for collection by a Join node. |

---

## Workflow Patterns

These are common patterns you'll build regularly. The visual builder should make these easy to assemble.

### Pattern 1: Simple Linear Pipeline

The most basic pattern — a straight chain of nodes that process a document from start to finish.

```
[ Prepare File ] → [ Submit OCR ] → [ Poll Results ] → [ Extract ] → [ Cleanup ] → [ Store ]
```

**Use case:** Standard single-page document OCR.

### Pattern 2: Pipeline with Quality Gate

Adds a confidence check and conditional human review to a linear pipeline.

```
[ ... OCR steps ... ] → [ Check Confidence ] → ◇ Needs Review?
                                                   ├─ Yes → [ Human Review ] → [ Store ]
                                                   └─ No  ────────────────────→ [ Store ]
```

The diamond is a Switch node. Both paths converge on the Store node.

**Use case:** Any workflow where low-confidence results need human verification.

### Pattern 3: Multi-Page Parallel Processing

Splits a document, processes each segment in parallel, then collects and validates results.

```
[ Prepare ] → [ Submit OCR ] → [ Poll ] → [ Extract ] → [ Split & Classify ]
    → ╔═══════════════════════════════════════════════╗
      ║  MAP: For each segment                        ║
      ║  ◇ Route by Type                             ║
      ║    ├─ Monthly Report → [ Child: Standard OCR ]║
      ║    ├─ Pay Stub       → [ Child: Standard OCR ]║
      ║    └─ Bank Record    → [ Child: Standard OCR ]║
      ║  → [ Combine Result ]                         ║
      ╚═══════════════════════════════════════════════╝
    → [ JOIN: Collect All ] → [ Validate Fields ] → [ Store ]
```

**Use case:** Multi-page reports with different document types that need type-specific OCR models and cross-document field validation.

### Pattern 4: Post-Processing Chain

Stack multiple correction and normalization steps after OCR extraction.

```
[ ... OCR extraction ... ] → [ Cleanup ] → [ Spellcheck ] → [ Character Confusion Fix ] → [ Normalize Fields ] → [ Store ]
```

**Use case:** Improving OCR accuracy through layered post-processing.

### Pattern 5: Error Fallback to Human Review

Use error connections to route failures to manual handling instead of failing the entire workflow.

```
[ Submit OCR ] → [ Poll Results ] → [ Extract ]
                                       │ (error)
                                       └─── ⚡ → [ Human Gate: Manual Entry ]
                                                       │
                                                       ↓
                                                 [ Store Results ]
```

**Use case:** Graceful degradation — if automated processing fails, a human can step in rather than losing the entire workflow run.

---

## Building Your First Workflow

A step-by-step walkthrough for creating a basic OCR processing workflow.

### Step 1: Set Up the Workflow

Create a new workflow and give it a name and description. This creates a blank canvas.

### Step 2: Define Context Variables

Before placing nodes, define the variables your workflow will use. At minimum, you'll need:

- `documentId` (text) — identifies the document being processed
- `blobKey` (text) — the file reference on storage
- `fileName` (text) — the original file name

For OCR workflows, you'll also typically need:
- `modelId` (text, default: "prebuilt-layout") — which OCR model to use
- `ocrResult` (object) — will hold the OCR output
- `cleanedResult` (object) — will hold post-processed results

### Step 3: Place and Configure Nodes

1. Drag a **Prepare File Data** activity node onto the canvas
   - Bind inputs: `blobKey`, `fileName` from context
   - Bind output: `preparedFileData` to context

2. Drag a **Submit to Azure OCR** activity node and connect it
   - Bind input: read `preparedFileData` from context
   - Bind output: write `apimRequestId` to context

3. Add a **Poll Until** node for **Poll OCR Results**
   - Bind input: `apimRequestId` from context
   - Set condition: stop when status is no longer "running"
   - Set interval: 10 seconds, with a 5-second initial delay
   - Bind output: write `ocrResponse` to context

4. Add an **Extract OCR Results** activity node
   - Bind inputs: `apimRequestId`, `ocrResponse`, `fileName`
   - Bind output: write `ocrResult` to context

5. Add a **Post-OCR Cleanup** activity node
   - Bind input: `ocrResult`
   - Bind output: `cleanedResult`

6. Add a **Store Results** activity node
   - Bind inputs: `documentId`, `cleanedResult`

### Step 4: Connect the Nodes

Draw connections from each node to the next in sequence. The builder should validate that the chain is complete and that all required inputs have bindings.

### Step 5: Set the Entry Point

Mark the first node (Prepare File Data) as the workflow entry point.

### Step 6: Validate and Save

Run validation to check for issues — missing bindings, disconnected nodes, invalid configurations. Fix any flagged problems, then save.

---

## Tips and Constraints

- **No cycles:** Workflows must be directed acyclic graphs (DAGs). You cannot create loops by connecting a later node back to an earlier one. Use Map nodes for iteration instead.
- **Map and Join are always paired:** Every Map needs a corresponding Join to collect results.
- **Switch needs a default:** Always define a default path on Switch nodes to handle unexpected values.
- **Keep context variables lean:** Store references (IDs, file keys) in context rather than large data blobs. The system handles large payloads externally.
- **Use Child Workflows for reuse:** If you find yourself rebuilding the same sequence of nodes, save it as a separate workflow and use a Child Workflow node to invoke it.
- **Timeouts matter:** Set realistic timeouts on activities and poll nodes. A poll with no timeout will eventually hit the system maximum (100 attempts by default).
- **Test incrementally:** Build and validate in stages rather than assembling the entire workflow at once.
