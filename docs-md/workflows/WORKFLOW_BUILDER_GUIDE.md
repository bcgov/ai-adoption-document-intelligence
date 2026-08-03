# Workflow Builder Guide

> **Status:** Reference for the visual workflow builder. The canvas editor described here is the live authoring surface at `/workflows/:workflowId/edit`; a handful of passages below are still phrased as "should" and are design intent rather than a description of what ships.

This document serves as the design reference for the visual workflow builder interface. It describes what users can build, how the pieces fit together, and the rules the system enforces — all from the perspective of someone dragging nodes onto a canvas and wiring them together.

---

## How Workflows Work

A workflow is a pipeline of steps that processes documents. You build one by placing **nodes** on a canvas and connecting them with **edges**. When a document enters the workflow, the engine starts at the first node and follows the connections, executing each step in order. Where the path splits, the engine can run branches in parallel or choose a path based on conditions.

Every workflow has a **context** — a shared data store that nodes read from and write to as the workflow runs. Think of it as a set of named variables (like `documentId`, `ocrResultRef`, `confidenceScore`) that flow through the pipeline. Each node declares what it reads and what it produces. For Azure OCR, large JSON lives in blob storage; context holds **refs** (`ocrResponseRef`, `ocrResultRef`, `cleanedResultRef`) — see [WORKFLOW_NODE_CATALOG.md](WORKFLOW_NODE_CATALOG.md) and [TEMPORAL_DATA_FOOTPRINT_REDUCTION_PLAN.md](../archive/TEMPORAL_DATA_FOOTPRINT_REDUCTION_PLAN.md).

---

## The Canvas

The builder canvas is where you assemble your workflow visually. It should feel familiar if you've used tools like n8n, Make.com, or similar automation platforms.

### Core Interactions

- **Add nodes** from a sidebar palette, organized by category
- **Connect nodes** by dragging from one node's output handle to another node's input handle
- **Configure nodes** by clicking them to open a settings panel
- **Pan and zoom** the canvas to navigate large workflows
- **Select and delete** nodes or connections
- **Right-click a node** to open the context menu — choose **Change activity type** to swap an activity in place (keeps the label, ports, error/retry/timeout policy, and any parameters whose keys exist in both the old and the new activity's catalog schema; required new fields are seeded with sensible defaults), or **Delete node** to remove it. Control-flow nodes (switch / map / join / sub-workflow / wait-until / wait-for-approval) can't be type-swapped — the entry is disabled and a tooltip explains why.
- **Right-click one of several selected nodes** and the menu acts on the whole selection instead: **Group these N steps**, **Ungroup** where it applies, and **Delete N steps**, which removes them in one write so a single undo brings them all back. The per-node entries are dropped there, because a type swap has no meaning for a set. Right-clicking a node *outside* the selection resets the selection to that node and gives you the ordinary single-node menu, so the menu never offers to act on steps you are no longer pointing at.
- **Right-click the empty canvas** to open the pane menu — **Add node here** (opens the activity picker and drops the new node at the point you clicked, whatever you pan to afterwards), **Auto-arrange**, **Fit view**, and **Select all**. The last three are disabled while the graph is empty. Group container boxes are never selectable, so **Select all** picks up steps only.
- **Canvas menus close on the next click.** The node menu, the wire menu and the pane menu all close when you left-click the canvas, click a node, or pan/zoom — as well as on <kbd>Esc</kbd>. (They used to survive a left click on the canvas: React Flow's pan/zoom layer swallows the mousedown that a click-away listener needs, so the menu closed everywhere except the one place you were clicking.)
- **Auto-arrange** (top-bar button, or the pane menu) tidies the canvas with a dagre layered layout, then fits the result in view. It is disabled until at least one node is on the canvas, and it lays out **the graph you can see**: in simplified view it arranges the group chips and ungrouped steps, and writes the result to that view's **own** arrangement — chip placements on the group, ungrouped steps on `metadata.simplifiedPosition`. Members are not moved at all, so the expanded canvas is exactly as you left it. (It used to translate each group's members by its chip's delta, which packed a whole group into a chip-sized slot and left the expanded view permanently overlapping.) The two views therefore arrange independently: a step that appears in both has a position in each, and nudging it in one does not move it in the other. A group that has never been arranged in simplified view puts its chip at the centroid of its members, which is what every workflow authored before this showed. A config that arrives with no `metadata.position` on any node — a template, or anything the agent built — gets a layout applied automatically once its cards have been measured, so the first frame reflects real card widths rather than a fallback estimate. Any config where at least one node already carries a position is left alone; hit **Auto-arrange** to re-tidy it.

Node cards carry the icon their catalog entry asks for, drawn from the [Tabler](https://tabler.io/icons) set — the same icon family the group and document-source pickers use. An activity that isn't in the catalog renders a question-mark icon; a catalogued activity whose `iconHint` has no mapping renders a neutral dot.

### The Top Bar

One row, one baseline, four divider-separated groups:

```
[ switcher · name ] │ [ find a node · simplified · auto-arrange · fit ] │ [ undo/redo · validity ] │ [ Save · Try · Run · More ]
```

| Group | Controls |
|---|---|
| Identity | The workflow **switcher** (search and jump to another workflow), the workflow **name** as a click-to-edit title, and a node/edge counter |
| Canvas | **Find a node** search, the **Simplified** view switch, **Auto-arrange**, and **Fit view** |
| State | **Undo** / **Redo**, and the **validity chip** — *Valid* / *N warnings* / *N errors* — which opens the validation drawer |
| Actions | **Save**, **Try**, **Run this workflow**, and **More** |

The **name** is a title you click to rename: clicking it swaps in a text field with the text selected, <kbd>Enter</kbd> or clicking away commits, <kbd>Esc</kbd> reverts. Clearing it is not a rename — the old name comes back. The **description** is not in the top bar at all; it lives in **More ▸ Workflow settings**, where it is a multi-line field that wraps instead of truncating mid-word.

**Simplified view** and **Auto-arrange** are visible controls rather than menu items — they change what you are looking at, which is not a menu item's job. What remains under **More**: History, Run history, Save as library, Group selected, Workflow settings, and Form preview.

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

### Colour Scheme (Wires and Port Dots)

Colours on the canvas are deliberate and family-based — one colour per data
**family**, not one per type. The **Legend** button at the bottom of the canvas
shows this same table in place.

Wires:

| Visual | Meaning |
|---|---|
| Dashed grey | Execution order only — no data rides the edge |
| Solid, coloured | A data wire — the colour is the data family (below) |
| Red | Error route (taken on failure) |
| Switch-accent (violet) | A branch of a Switch condition |
| Thick blue | This edge ran, when replaying a past run |

Port dots (the connection handles on node cards):

| Visual | Meaning |
|---|---|
| Grey dot | Untyped port — accepts/produces anything |
| Blue dot | Documents & files (`Document`, `PreparedFile`, `DocumentRef`, …) |
| Green dot | Segments (`Segment`, `TypedSegment`, …) |
| Violet dot | OCR results (`OcrResult`, `OcrFields`, `OcrTable`) |
| Yellow dot | Classification & validation (`Classification`, `ValidationResult`, …) |
| Teal dot | References |
| Cyan dot | Identifiers (`DocumentId`, `GroupId`, `ModelId`, `RequestId`) |
| Double ring | The port carries a **list** of that kind (`T[]`) |
| Amber ring | A required input that still needs a source |

The mapping lives in the artifact-kind registry
(`packages/graph-workflow/src/types/artifact-registry.ts`) — new kinds must
join an existing family colour rather than introduce a new one.

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

### Optional Inputs, and Typing a Value on a Port Row

Not every input a node card advertises needs an answer. `file.prepare`'s `fileType`, `fileName` and `contentType` are all optional and auto-derived from the file's blob key — a brand-new workflow runs with all three empty, and that is the intended path.

Those ports are folded, not hidden. In the node's **Inputs** panel, optional ports with nothing bound to them collapse behind a **"N optional inputs"** disclosure, closed on arrival, so the panel stays as short as it was while the ports the card advertises stop being unreachable. Anything holding a wire, a pin or a typed-in value is never folded — giving a port a value moves its row up into the main list.

Open the disclosure and each row offers a value field. The field spans the full width of the panel on its own line, indented under the port's label and ruled off from it so the two read as one control, and the port's own description sits under the field as helper text where it can wrap (*"Auto-detected from the extension if omitted"*). Three states, and the common one costs nothing:

| You want | You do |
|---|---|
| Auto-detection | Nothing |
| Force `image` on this one node | Type it on the port row |
| Let the caller choose per run | Type it, then **Make this a workflow input** |

A typed value is an **override**, not a requirement. It is stored as a hidden context entry with your text as its `defaultValue`, and the port is pinned to it so the auto-wire resolver won't quietly replace it with the first upstream producer that could satisfy the port. Because it is a default, a run that supplies the same key still wins. Clearing the field removes the entry and hands the port back to auto-wiring.

**Make this a workflow input** (on the row's ⋯ menu) promotes the hidden entry into a named context declaration you choose the name for, flagged `isInput`. Your typed value survives as its default, and the variable now appears in the Workflow settings context table, in the Run drawer, and in the derived input schema — as an optional property with a default, since it already has a value. Names must be letters, numbers and underscores starting with a letter, and can't collide with an existing declaration.

The **Default value** field in the Workflow settings context editor sets the same thing from the other end. It is the surface for values worth naming and sharing — not the way in. That journey starts on the port row.

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

### Creating a group from a selection

In the visual editor:

1. Select two or more nodes on the canvas: **shift-drag** a marquee rectangle across them, or **Ctrl-click** (Cmd on macOS) each one. Plain **shift-click does not add to the selection** — xyflow binds Shift to the marquee and Ctrl/Cmd to multi-selection. (This page said shift-click for months; measured 2026-08-03, shift-click leaves one node selected.)
2. The "Group selected" button in the top bar becomes enabled (it shows a tooltip "Select 2+ nodes to group them" when fewer than 2 are picked).
3. Click "Group selected" — or right-click any of the selected nodes and choose **Group these N steps**, which runs the same operation without the trip to the top bar. A new entry appears in `nodeGroups` with an auto-numbered label (e.g., `Group 1`, then `Group 2`, …) and the selected node ids, and a container box is drawn around the members. A toast confirms how many steps were grouped and names the header strip as the way to move them.

Grouping does **not** flip the canvas into simplified view. It used to, because a toast was the only sign a group existed — the box is the feedback now, so the mode change became cost without benefit.

Each node can belong to at most one group at a time — if any of the selected nodes were already a member of another group, they are moved into the new group. Old groups that are left with no members are removed automatically. Members of a synthetic map-body group are not eligible: they are grouped by their Map node already, so they are filtered out of the selection. If that leaves fewer than two nodes, the gesture refuses with a toast rather than making a group nobody asked for.

### Editing a group in the right rail

Right after a group is created, the right-rail panel switches from the per-node settings to the new group's settings panel. You can get back to it later by clicking the group's **header strip** on the canvas (expanded view) or its **chip** (simplified view). The panel exposes:

- **Label** — required text field; surfaced on the container header and on the group chip in simplified view.
- **Description** — optional textarea; appears as a sub-line on the chip.
- **Icon** — searchable dropdown of the built-in glyph keys (e.g. `scan`, `cleanup`, `quality`, `human`, `save`, `prepare`, `process`, `validate`). The dropdown previews each glyph next to the key name.
- **Color** — Mantine color input with a small swatch of presets. Accepts any hex string.
- **Members** — read-only list of the group's member node labels. Each row has a remove button; removing the last member of a group drops the group entry entirely (after a confirmation prompt).
- **Exposed parameters** — list editor (US-044) for surfacing specific node parameters as group-level overrides. Each row carries a `label`, a `node` selector restricted to the group's members (with the node's label as the visible option text), a `param path` (dot-separated path into the workflow config), and a `type` selector (`Text` / `Number` / `Boolean` / `Enum`). Picking `Enum` reveals an `options[]` sub-editor for the allowed values. Removing a member from the group automatically prunes any exposed parameter that referenced that member and surfaces the prune via a toast.
- **Ungroup (steps stay)** — a button at the bottom that removes the `nodeGroups[<id>]` entry. The underlying nodes are not touched, and a toast confirms how many steps were released.

Selecting any individual node clears the active group and switches the panel back to the per-node settings. Node selection wins over the group panel — so if a step is selected, click empty canvas to deselect it before clicking a group header, or the rail stays on the step.

### How a group looks on the canvas

In simplified view a chip is **draggable**, and its drop is saved on the group
itself. Dragging it rearranges that view only — the members keep the expanded
positions they had, which is the same rule Auto-arrange follows there.

Expanded, a group is a **container box**: a dashed, tinted rectangle sized to the bounding box of its members — measured from the cards as rendered, not estimated from the catalog, so it fits tightly instead of overhanging into its neighbours — with a **header strip** across the top carrying the group's icon, colour and label. Collapsed (simplified view) the same group is a single **chip**. The box around a Map node's body is the same component in green — it has a header too, but no icon and no group settings of its own; clicking it selects the Map node.

The box body is inert (it doesn't intercept clicks, so you can still marquee-select and wire through it) and it is never selectable, so it can't be deleted or swept up by **Select all**. There is exactly one visual language for grouping now: the per-node dashed violet outline with a label that only appeared on hover is gone.

### How a group behaves on the canvas

A group here is an annotation over an executable graph, not a Figma-style container — its members carry edges, bindings and run history of their own. That difference decides which Figma habits carry over:

| Gesture | What happens | Why |
|---|---|---|
| Drag the header strip (expanded view) | The whole group moves, keeping its shape — one undo step | Cohesive movement is a target you aim at, not a surprise you trip over |
| Drag a member (expanded view) | Moves **only** that member; the box re-fits around where it landed | Repositioning one step inside its own group has to be possible |
| Drag a node into the box's area | Joins nothing. Membership is a config fact, not a geometry accident | The engine reads `nodeIds`; two overlapping rectangles are not a decision anyone made |
| Click the header strip | Opens the group's settings in the right rail | Expanded view had no way to reach them before |
| Click a member | Selects and edits **only** that member | You still need to configure one step at a time |
| Delete a member (expanded view) | Removes **only** that node; the group keeps its other members | Deleting several real pipeline steps because one was selected is destructive out of proportion to the click |
| Delete the chip (simplified view) | Deletes the group **and** the steps inside it, after a confirm naming the step count. Cancelling changes nothing — including the wires — and confirming costs one undo | Collapsed, the chip *is* the object — there is nothing else the gesture could mean |
| Ungroup (context menu or right rail) | Drops the grouping; every step stays | The way to keep the work and lose only the annotation |

Header drag reverses the rule that shipped on 2026-08-02, where dragging *any* member carried its siblings. That rule existed because there was nothing else to grab: a group was a dashed outline per card with no surface of its own. The header is that surface, and the reason expired with it.

A synthetic map-body container has no header drag — it is derived from the Map node rather than authored, and its members follow the map's own layout rules.

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

Create a new workflow. Click the title in the top bar to name it; the description lives in **More ▸ Workflow settings**. This creates a blank canvas.

### Step 2: Define Context Variables

Before placing nodes, define the variables your workflow will use. At minimum, you'll need:

- `documentId` (text) — identifies the document being processed
- `blobKey` (text) — the file reference on storage
- `fileName` (text) — the original file name

For OCR workflows, you'll also typically need:
- `modelId` (text, default: "prebuilt-layout") — which OCR model to use
- `ocrResponseRef`, `ocrResultRef`, `cleanedResultRef` (object) — blob references, not full OCR JSON

### Step 3: Place and Configure Nodes

1. Drag a **Prepare File Data** activity node onto the canvas
   - Bind inputs: `blobKey`, `fileName` from context
   - Bind output: `preparedFileData` to context

2. Drag a **Submit to Azure OCR** activity node and connect it
   - Bind input: read `preparedFileData` from context
   - Bind output: write `apimRequestId` to context

3. Add a **Poll Until** node for **Poll OCR Results**
   - Bind inputs: `apimRequestId`, `documentId`, `modelId`
   - Set condition: stop when `ocrResponseRef.status` is not `running`
   - Set interval: 10 seconds, with a 5-second initial delay
   - Bind output: port `response` → `ocrResponseRef`

4. Add an **Extract OCR Results** activity node
   - Bind inputs: `apimRequestId`, `ocrResponse` ← `ocrResponseRef`, `fileName`, `documentId`
   - Bind output: port `ocrResult` → `ocrResultRef`

5. Add a **Post-OCR Cleanup** activity node
   - Bind `ocrResult` ← `ocrResultRef`, `documentId`
   - Bind output: `cleanedResultRef`

6. Add a **Store Results** activity node
   - Bind inputs: `documentId`, `cleanedResult` ← `cleanedResultRef`

### Step 4: Connect the Nodes

Draw connections from each node to the next in sequence. The builder should validate that the chain is complete and that all required inputs have bindings.

### Step 5: Set the Entry Point

Mark the first node (Prepare File Data) as the workflow entry point.

### Step 6: Validate and Save

Run validation to check for issues — missing bindings, disconnected nodes, invalid configurations. Saving never blocks on these: a save always persists what you have. A clean save toasts green — *"Saved"* / *"Created"*. A save with blocking issues toasts amber and says so once — *"Saved as a draft — Updated "My workflow". 3 issues to fix before it can run."* — with a **Review issues** action that opens the validation drawer. The toast doesn't recite validator paths any more; the drawer is the surface built for that, and it stays open while you work through them.

What *is* gated on a clean validation pass is running — Try and Run stay disabled (with the reason in their tooltip) until every error is fixed, and the API refuses run starts for an invalid saved config the same way.

---

## Tips and Constraints

- **No cycles:** Workflows must be directed acyclic graphs (DAGs). You cannot create loops by connecting a later node back to an earlier one. Use Map nodes for iteration instead.
- **Map and Join are always paired:** Every Map needs a corresponding Join to collect results.
- **Switch needs a default:** Always define a default path on Switch nodes to handle unexpected values.
- **Keep context variables lean:** Store references (IDs, file keys) in context rather than large data blobs. The system handles large payloads externally.
- **Use Child Workflows for reuse:** If you find yourself rebuilding the same sequence of nodes, save it as a separate workflow and use a Child Workflow node to invoke it.
- **Timeouts matter:** Set realistic timeouts on activities and poll nodes. A poll with no timeout will eventually hit the system maximum (100 attempts by default).
- **Test incrementally:** Build and validate in stages rather than assembling the entire workflow at once.
