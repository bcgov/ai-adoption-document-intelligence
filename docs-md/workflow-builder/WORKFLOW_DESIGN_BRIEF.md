# Workflow Builder — Design Brief

**Audience:** Product designer working on the visual workflow builder.
**Purpose:** Describe — in plain language — what the workflow builder is, how people use it, and what the visual design must support so that everything currently done by editing JSON files can be done on the canvas instead.

This document is paired with [WORKFLOW_NODE_CATALOG.md](WORKFLOW_NODE_CATALOG.md), which lists every individual node and its configuration fields.

---

## 1. What is a workflow?

A **workflow** is a step-by-step recipe for processing a document. The system runs documents through workflows automatically. A workflow says things like:

1. Take this PDF.
2. Send it to an OCR service to extract the text.
3. Wait for the result.
4. Clean up the text.
5. Check whether the result is reliable enough.
6. If reliable, save it. If not, ask a human to review it.

Each step in the recipe is a **node** on the canvas. The arrows between nodes are **connections** — they say "after this step finishes, do that next step."

Users build a workflow by dragging nodes onto a canvas, connecting them with arrows, and configuring each node by clicking it and filling in a side panel.

---

## 2. Who uses it and what do they need?

The user is typically a **technical operator** (not a developer) who is configuring how the system processes a particular kind of document. They are comfortable with concepts like "if/then" branching, dropdowns, and forms, but they should never have to read or write code, JSON, or regular expressions unless they specifically choose to.

The builder must let them:

- Build a new workflow from scratch by picking nodes from a catalog.
- Open and edit an existing workflow.
- Save a workflow as a reusable building block (a "library workflow") that can be used inside other, larger workflows.
- See, at a glance, whether the workflow is valid and ready to run, or if something is wrong (missing setting, dangling connection, etc.).
- Test their workflow on real documents and see what happens at each step.

---

## 3. Mental model: the shared notebook ("context")

Every running workflow has a **shared notebook** — like a clipboard or a whiteboard that every step can read from and write to. Each entry in the notebook has a **name** (like `documentId`, `ocrResult`, `confidenceScore`) and a value.

Steps don't pass data directly to each other through the arrows on the canvas. Instead:

- A step **reads** values it needs by name from the notebook.
- A step **writes** its results back to the notebook by name.
- The next step can then read those results.

### The user does not manually manage notebook entries

The notebook is **auto-discovered from the canvas**. The user never opens a screen to "add a variable." Instead:

- **Node outputs auto-register.** When the user names a node's output (e.g., "write result as `preparedFileData`"), that name instantly becomes available in every downstream node's input picker. The canvas topology *is* the variable registry.
- **Trigger inputs live on a "Start" card.** The entry node (or a dedicated trigger bar at the top of the canvas) has a lightweight section where the user declares the few values the workflow receives from the outside (e.g., `documentId`, `blobKey`, `fileName`). These are the workflow's "function signature" — typically 2–4 items.
- **Configuration constants live on the nodes that use them.** Instead of a global `monthlyReportModelId` notebook entry, the Sub-workflow node for "OCR Monthly Report" has a parameter field "OCR Model ID" with a default value. If multiple nodes share the same constant, the user can hoist it via the "expose as workflow parameter" feature (node groups / exposed params — see §10).

An optional read-only **Variables sidebar** (collapsed by default) can auto-generate a list of every variable discovered from the canvas, grouped by origin ("trigger input" vs. which node produces it). This is a convenience view, not a management screen — the user never has to visit it to make a workflow work.

This matters for the design because:

- The **arrows on the canvas mean "what runs after what"**, not "what data flows where."
- Each node's settings panel has **"This step reads"** (dropdown pickers that autocomplete from upstream outputs and trigger inputs) and **"This step produces"** (user-named output fields that become available downstream).
- There is **no separate global variable-management screen** to maintain.

> **Don't model arrows as data pipes.** Many workflow tools (Zapier, n8n) make the arrow look like a data hose. In our system, the arrow is just an order-of-execution arrow. The data plumbing happens by name in each node's settings panel. Users will need a clear visual mental model that separates "execution order" (arrows) from "data sharing" (the notebook).

---

## 4. Anatomy of the builder

The design needs to cover, at minimum, these six surfaces:

### 4.1 The canvas

Where nodes live and connections are drawn. Should support:

- Pan, zoom, fit-to-screen, mini-map.
- Multi-select, drag-select, copy/paste, undo/redo.
- Auto-layout button (one click to tidy up).
- Node grouping (visual frames around related nodes — see §10).
- Different visual styles for different connection types (see §6).
- Inline validation badges on nodes (red for errors, yellow for warnings) with hover tooltips.

### 4.2 The node palette

A sidebar or popover listing every node type the user can add. Should support:

- Categorization (e.g., "OCR processing", "Document handling", "Flow control", "Validation"). See [WORKFLOW_NODE_CATALOG.md](WORKFLOW_NODE_CATALOG.md) for the full list.
- Search/filter by name.
- Drag-to-canvas or click-to-add.
- Recently-used / favorites.
- A short description of each node when hovered.

### 4.3 The node settings panel

Opens when a node is selected. Different nodes have different configuration shapes (see [WORKFLOW_NODE_CATALOG.md](WORKFLOW_NODE_CATALOG.md)). Common patterns the design must handle:

- Plain form fields (text, number, dropdown, toggle).
- Lists of items the user can add/remove/reorder (e.g., "branches" in a Switch node, "rules" in a validation node).
- A **"This step reads" / "This step produces"** section — for each input slot, the user picks from a dropdown of available upstream outputs and trigger inputs; for each output slot, the user names the result. This appears on most nodes.
- A **timeouts and retry policy** section — every step that talks to an external system has these.
- An **error handling** section — what happens if this step fails.
- Conditional fields — fields that only appear depending on other choices (e.g., the "page ranges" list only appears when the split strategy is "custom ranges").

### 4.4 The workflow-level settings

A separate area (overlay, tab, or dedicated screen) for settings that belong to the whole workflow rather than any one node. Includes:

- Workflow name, description, version, tags.
- **Trigger inputs** — the small set of values the workflow receives from the outside when it starts (e.g., `documentId`, `blobKey`, `fileName`). See §3. These can also be edited on the entry node / start card directly on the canvas.
- Which node is the entry point (the first one to run). Often inferred from the canvas, but the user must be able to set it explicitly.
- Node groups (see §10).
- **Variables sidebar** *(optional, collapsed by default)* — A read-only auto-generated list of all variables discovered from the canvas, grouped by origin. Useful for documentation; not required for building a workflow.

### 4.5 The validation panel

A list of all problems detected in the current workflow. Items here should:

- Highlight the affected node when clicked.
- Be grouped by severity (errors block saving; warnings don't).
- Cover problems like: missing required setting, reading from a variable that no upstream node produces, two arrows where only one is allowed, dangling arrow, no entry point, etc.

### 4.6 The run / preview surface

A way to test the workflow. Likely a separate view, but the canvas should also be able to overlay execution status — green checkmarks on completed nodes, blue spinners on running nodes, red on failed nodes — when looking at a past run.

---

## 5. The node types

There are **seven node shapes** in the system. Each has a fixed visual identity. Within those shapes, the **Activity** category is split into many distinct subtypes, and the design should treat each one as its own node in the palette (see §11 below).

| Shape | Name | Purpose | Suggested visual |
|---|---|---|---|
| 1 | **Activity (specific operation)** | Does one concrete thing — runs OCR, splits a PDF, validates fields, etc. The most common node. | Rounded rectangle, color varies by category (see §11) |
| 2 | **Switch / Branch** | Routes the flow down one of several paths based on a condition. | Diamond, yellow |
| 3 | **Loop (Map)** | Runs a sub-section of the workflow once for each item in a list. | Container/frame, green |
| 4 | **Collect (Join)** | Gathers the results from a Loop's iterations back into a single list. | Rounded rectangle with merge icon, green |
| 5 | **Sub-workflow** | Runs another saved workflow as a single step. | Rectangle with nested-workflow icon, purple |
| 6 | **Wait & Retry (Poll)** | Repeatedly checks a service until it's ready (e.g., waiting for OCR to finish). | Rounded rectangle with clock/refresh icon, orange |
| 7 | **Human Gate** | Pauses the workflow until a person responds (approval, rejection, manual entry). | Rounded rectangle with person icon, red |

> The current designer mockup uses a single "Activity" node with the operation chosen from a dropdown. We recommend changing this. **Each activity type should be its own distinct node in the palette** (see §11).

---

## 6. The three kinds of connection

Connections (arrows between nodes) come in three flavors. The design must visually distinguish them.

| Type | When to use | Suggested visual |
|---|---|---|
| **Normal** | The default. "After A finishes, do B." | Solid arrow |
| **Conditional** | Comes out of a Switch node. Each conditional arrow corresponds to one branch of the switch. | Dashed arrow with a label showing the condition |
| **Error / fallback** | An alternative path taken **only** if the source node fails (after retries are exhausted), or if a Human Gate times out. | Red dashed arrow |

Important rules the design must enforce visually:

- A regular Activity node has **one outgoing arrow** (plus optionally an error fallback arrow if error handling is configured).
- A Switch node has **one outgoing arrow per branch** plus a "default" arrow.
- A Human Gate node has **one outgoing arrow** plus optionally a "timeout fallback" arrow.
- **Cycles are not allowed** — you can't have arrows that loop back to an earlier node (loops are expressed only via the Loop/Map node).

The error-fallback arrow is special: it should only become drawable from a node after the user has explicitly enabled the "fall back on error" option in that node's settings. Same for the human-gate timeout fallback. The visual affordance — likely a small extra handle that appears on the node — should be obvious.

---

## 7. What the design must support (full feature coverage)

Below is a checklist of capabilities the visual builder must cover. Each item corresponds to a feature that exists in the system today and is currently configured by editing JSON.

### 7.1 Workflow structure

- [ ] Add, remove, move, copy/paste nodes.
- [ ] Draw connections between nodes; remove connections.
- [ ] Designate one node as the entry point.
- [ ] Save, load, rename, duplicate workflows.
- [ ] Versioning: a workflow can have multiple versions; the user can see version history and pick which one to edit.
- [ ] Save a workflow as a "library workflow" that can be referenced from other workflows.

### 7.2 The shared notebook (context) — auto-discovered

The notebook is built automatically from the canvas. The user does not manage variables in a separate screen.

- [ ] **Trigger inputs** — on the entry node (or a dedicated start card), the user declares the 2–4 values the workflow receives from the outside (name + type). These are the only "manually defined" variables.
- [ ] **Node outputs auto-register** — when a user names a node's output (e.g., "write result as `preparedFileData`"), that name becomes available in every downstream node's input picker.
- [ ] When a node output is renamed, all downstream references should update automatically (or show a warning if they can't).
- [ ] Input pickers should **autocomplete** from trigger inputs + all upstream node outputs.
- [ ] Reference nested fields with dot notation (e.g., `currentSegment.blobKey`, `ocrResponse.status`). The autocomplete should support drilling into known structured types where possible.
- [ ] An optional read-only **Variables sidebar** (collapsed by default) auto-generates a list of all discovered variables, grouped by origin (trigger input vs. which node produces it).

### 7.3 Per-node configuration

For every node, the panel must support all of the following where they apply (see [WORKFLOW_NODE_CATALOG.md](WORKFLOW_NODE_CATALOG.md) for which apply to which node):

- [ ] **Label** — a human-readable name shown on the canvas.
- [ ] **"This step reads" / "This step produces"** — for each input slot, a dropdown picker to select from available upstream outputs and trigger inputs; for each output slot, a user-named result that becomes available to downstream nodes.
- [ ] **Static parameters** — settings that don't come from the notebook (e.g., a confidence threshold of `0.95`, or a list of validation rules).
- [ ] **Timeouts** — `start-to-close` (how long this single attempt may take) and optionally `schedule-to-close` (overall budget including retries).
- [ ] **Retry policy** — maximum attempts, initial wait between attempts, backoff multiplier, maximum wait between attempts.
- [ ] **Error handling policy** — one of: "Retry then fail" (default), "Retry then follow fallback arrow", "Retry then skip and continue".
- [ ] **Notes/metadata** — free-form notes attached to the node (handy for documentation).

### 7.4 Branching (Switch nodes)

- [ ] Add, remove, reorder branches in the side panel; the canvas updates the outgoing arrows to match.
- [ ] Each branch has a **condition** built without writing code. The condition builder must support:
  - A **left value**: a variable reference (upstream output or trigger input), or a fixed value.
  - An **operator**: equals, not-equals, greater than, greater-or-equal, less than, less-or-equal, contains, is empty, is not empty, is in a list, is not in a list.
  - A **right value**: another variable reference, or a fixed value.
  - **AND / OR / NOT** combinators so the user can build conditions like "(A is X) AND (B is greater than 5)".
- [ ] Each branch points to a different outgoing arrow; the user can drag the arrow's target to change which node the branch goes to.
- [ ] A **default branch** that catches anything not matched by the explicit conditions.
- [ ] Visual labels on the outgoing arrows showing the condition (e.g., "type = monthly-report").

### 7.5 Loops (Map / Join pairs)

- [ ] Configure: which list (variable) to iterate over, what name to give each item inside the loop, optionally what name to give the iteration index, optional concurrency limit (e.g., "process up to 10 items at the same time").
- [ ] Visually contain the body of the loop — the nodes that run for each iteration should be **inside or framed by** the Loop node, so it's obvious which nodes are in the loop.
- [ ] Mark which node inside the loop is the **start** of each iteration and which is the **end** (where results are collected).
- [ ] A paired **Collect (Join)** node placed *after* the loop, configured with:
  - Which Loop node it pairs with.
  - Strategy: "wait for all" or "as soon as one finishes".
  - The variable name where the collected list of results goes.

### 7.6 Sub-workflows

- [ ] Pick a saved workflow from a list (or paste in an inline workflow).
- [ ] Map available variables from the parent workflow into the sub-workflow's expected inputs.
- [ ] Map the sub-workflow's outputs back into named variables in the parent.
- [ ] Open the sub-workflow definition in a new tab/view to inspect or edit it (with appropriate permissions).

### 7.7 Wait & Retry (Poll)

- [ ] Pick which activity to run on each poll cycle.
- [ ] Define the **stop condition** using the same condition builder as the Switch node.
- [ ] Configure: interval between polls, optional initial delay before first poll, optional max attempts (default 100), optional overall timeout.
- [ ] Same input/output bindings, parameters, timeouts, retries, error policy as a regular Activity.

### 7.8 Human Gate

- [ ] Set a unique signal name.
- [ ] Define the expected payload (what data the human reviewer will provide). This is a small schema editor — name and type of each expected field.
- [ ] Set the timeout (e.g., 24 hours).
- [ ] Choose what happens on timeout: fail the workflow / continue as if approved / follow a fallback arrow.
- [ ] If "follow fallback arrow", the canvas should show a second outgoing arrow (the fallback path).

### 7.9 Error handling and fallback paths

- [ ] On any Activity, Wait-and-Retry, or Human Gate node, the user can enable a **fallback path**.
- [ ] When enabled, a second outgoing arrow becomes drawable (visually distinct — red dashed). This arrow points to the node that runs if all retries fail (or if the human gate times out).
- [ ] The fallback arrow can target *any* node, including a Human Gate (manual recovery) or a Store-Rejection activity.

### 7.10 Validation surfacing

The system already runs a validator in the background. The design must surface its output. Specific things the validator catches that need visible feedback:

- [ ] A node has missing required parameters.
- [ ] A node reads from a variable name that no upstream node produces and that isn't a trigger input.
- [ ] An arrow points to a node that no longer exists.
- [ ] The workflow has no entry point set, or has multiple.
- [ ] A Switch node has a branch that points to a non-existent arrow.
- [ ] A Loop node references body-start or body-end nodes that aren't actually in its body.
- [ ] A Collect node references a Loop that doesn't exist.
- [ ] A Sub-workflow node references a workflow that doesn't exist or has incompatible inputs.
- [ ] A Sub-workflow node maps to/from variable names that don't exist in the current scope (no upstream producer and not a trigger input).
- [ ] An activity references an unknown activity type.

### 7.11 Node groups (visual organization)

- [ ] Select multiple nodes and group them visually.
- [ ] A group has: label, description, color, icon, and a list of member nodes.
- [ ] Groups can be collapsed/expanded.
- [ ] Groups can **expose parameters** — the user picks a few specific settings from inside the group (e.g., "OCR model ID", "confidence threshold") and marks them as overridable. When this workflow is later used in a benchmark or comparison run, only those exposed parameters appear as editable knobs, without the user having to dig into individual nodes. The design needs:
  - A way to mark a parameter as exposed when configuring a node, OR a separate "exposed parameters" editor at the group level.
  - A list view showing all exposed parameters in a workflow with their labels, paths, and types.

### 7.12 Templates and library workflows

- [ ] A starting catalog of workflow templates the user can clone (e.g., "Standard OCR", "Multi-page report processing").
- [ ] A "save as template" / "save as library" action on any workflow.
- [ ] When configuring a Sub-workflow node, the user can browse the library and pick from a list with previews.

### 7.13 Run / inspection surfaces

These are not strictly part of "building" but the same canvas is reused to view past runs:

- [ ] Show execution status overlaid on each node (not started / running / completed / failed / skipped).
- [ ] Click a node in a past run to see its inputs, outputs, errors, retry attempts, and timings.
- [ ] Show the path the workflow actually took (highlight active arrows, dim unused ones).
- [ ] Show pending Human Gate steps with the action the user is expected to take.

---

## 8. Real-world example: the Multi-Page Report workflow

To make the requirements concrete, here is what the existing **Multi-Page Report Workflow** looks like as a list of nodes and arrows. The design must be able to express this comfortably on a canvas.

The workflow processes a PDF that contains several different document types stitched together (a monthly report, pay stubs, bank records). It does an initial OCR on the whole thing, splits it into pieces using keyword markers, runs the right kind of OCR on each piece in parallel, then validates that the numbers across pieces are consistent.

```
[ Prepare File ]                           ← Activity
       ↓
[ Submit Initial OCR ]                     ← Activity
       ↓
[ Update Document Status ]                 ← Activity
       ↓
[ Wait for OCR to finish ]                 ← Wait & Retry (poll)
       ↓
[ Extract OCR Results ]                    ← Activity
       ↓
[ Split & Classify by Keywords ]           ← Activity
       ↓
╔════════ LOOP: For each segment ══════════╗
║                                          ║
║  ◇ Route by document type ◇             ║   ← Switch
║   ├─ "monthly-report" → [ Sub: Standard OCR ] ─┐
║   ├─ "pay-stub"       → [ Sub: Standard OCR ] ─┤
║   ├─ "bank-record"    → [ Sub: Standard OCR ] ─┤
║   └─ default          → [ Sub: Standard OCR ] ─┤
║                                                │
║                                                ↓
║                            [ Combine Segment Result ]   ← Activity
╚═══════════════════════════════════════════════╝
       ↓
[ Collect All Segment Results ]            ← Collect (Join)
       ↓
[ Validate Fields Across Segments ]        ← Activity (with rules: arithmetic, field-match, array-match)
       ↓
[ Store Results ]                          ← Activity
```

**Trigger inputs** (declared on the start card): `documentId`, `blobKey`, `fileName`.
**Auto-discovered variables** (from node outputs — the user never manages these manually): `preparedFileData`, `apimRequestId`, `ocrResponse`, `initialOcrResult`, `segmentsWithTypes`, `currentSegment`, `segmentOcrResult`, `combinedSegment`, `processedSegments`, `validationResults`.
**Configuration constants** (set as static parameters on the nodes that use them, not as global variables): `monthlyReportModelId`, `payStubModelId`, `bankRecordModelId`, `ocrConfidenceThreshold`.

Node groups (just for visual organization): "Initial OCR", "Split & Classify", "Collect Results", "Validate Fields", "Store Results".

The full JSON for this workflow lives at [`docs-md/graph-workflows/templates/multi-page-report-workflow.json`](../graph-workflows/templates/multi-page-report-workflow.json) — useful as a reference for what the design must be capable of representing.

---

## 9. Common workflow patterns to design for

These are the shapes designers will encounter most. The design should make these natural and obvious.

### Pattern 1 — Linear pipeline
Five to eight Activity nodes in a chain. The most common shape. The design should keep this looking clean and uncluttered.

### Pattern 2 — Quality gate
A linear pipeline that hits a Switch node (e.g., "is confidence too low?") and either continues straight or detours through a Human Gate before rejoining the main path. Two paths converge on the same downstream node — make sure the canvas handles converging arrows cleanly.

### Pattern 3 — Multi-page parallel processing
Initial OCR → Split → Loop (with a Switch inside picking the right sub-workflow per segment) → Collect → Validate → Store. The "loop with a switch inside" pattern is heavy on visual hierarchy — the Loop should clearly contain its body.

### Pattern 4 — Layered post-processing
A chain of cleanup nodes: Cleanup → Spellcheck → Character Confusion → Normalize Fields → Store. All operating on the same variable (`ocrResult`), each one rewriting it before the next one reads it. The design might benefit from a way to visually denote "these all operate on the same data" — perhaps automatic alignment, or a node group.

### Pattern 5 — Error fallback to human review
Any Activity node with its error policy set to "fall back on error" gets a red dashed arrow to a Human Gate, which then continues to a Store-Rejection or a manual-entry path.

---

## 10. Node groups: what they are and why they matter

Node groups are **purely visual** — they don't change how the workflow runs. They're for human readability and for marking parameters as overridable from the outside.

Three things make groups important to the design:

1. **They group nodes visually** — like Sticky Notes around a bunch of nodes, with a label and a color. Helps users navigate large workflows.
2. **They can be collapsed** — a long pipeline can be tucked into a single labeled box for high-level overview.
3. **They expose parameters** — a group can publish a few specific settings (taken from inside member nodes) as the workflow's "knobs". When this workflow is later used by someone else (e.g., as a sub-workflow, or as the unit of comparison in a benchmark), only those exposed parameters are editable. This lets the workflow author hide internal complexity and present a clean interface.

The design should make exposing a parameter a one-click action from a node setting — for example, a small "expose" icon next to each setting that, when clicked, lets the user pick which group the exposed knob belongs to, give it a friendly label, and choose its widget type (text / number / boolean / dropdown / duration).

---

## 11. Why the "single Activity with a dropdown" model needs to change

The current designer mockup has a single generic **Activity** node with the operation type chosen from a dropdown inside the side panel. We recommend replacing this with **one distinct node per activity type** in the palette.

### Reasons

1. **Each activity has a different configuration shape.** "Submit OCR", "Spellcheck", and "Validate Fields" share almost nothing in their settings panels. A dropdown that completely changes the form below it is jarring and hides the diversity.
2. **Discoverability.** When the user opens the palette and types "spell" or browses the "OCR Correction" category, they should see a "Spellcheck" node sitting there. With the dropdown approach they have to first add a generic Activity node and then know to look in a list for the activity they want.
3. **Visual differentiation.** Different categories of activity (Azure OCR, post-processing, document handling, validation, storage) deserve different colors / icons so users can read a workflow at a glance. With one generic node, every activity looks the same on the canvas.
4. **Documentation surface.** Each distinct node can have its own description, examples, and inline help. With a generic node + dropdown, this gets crammed into the dropdown's tooltip.
5. **Templates and palette curation.** The palette can be organized into categories (see [WORKFLOW_NODE_CATALOG.md](WORKFLOW_NODE_CATALOG.md)) with the most common nodes promoted to a "favorites" section, which is impossible if there's only one Activity node.

The visual *shape* (rounded rectangle) and the underlying execution model can still be the same for every activity. Only the **palette entry, side-panel form, and badge/icon** differ per activity type.

### Proposed palette categories

(See [WORKFLOW_NODE_CATALOG.md](WORKFLOW_NODE_CATALOG.md) for the full list of nodes in each.)

- **Flow Control** — Switch, Loop, Collect, Sub-workflow, Wait & Retry, Human Gate
- **File Handling** — Prepare File
- **OCR (Azure)** — Submit OCR, Wait for OCR Result, Extract OCR Result
- **OCR Cleanup & Correction** — Cleanup, Spellcheck, Character Confusion Fix, Normalize Fields
- **OCR Quality** — Check Confidence, Enrich Results
- **Document Handling** — Split Document, Classify Document, Split & Classify, Combine Segment Result
- **Validation** — Validate Fields Across Segments
- **Storage** — Store OCR Results, Store Rejection, Update Document Status
- **Data Transformation** — Generic Data Transform
- **Benchmarking** (advanced; usually hidden) — Benchmark Evaluate, Aggregate, Cleanup, Update Status, Compare Against Baseline, Write Prediction, Materialize Dataset, Load Dataset Manifest, Load OCR Cache, Persist OCR Cache

---

## 12. Things to avoid

- **Don't draw arrows as "data pipes" with type information on them.** The system has no typed wiring between nodes. Data is exchanged via the shared notebook (§3). Showing arrows as typed pipes would create an illusion the engine doesn't honor.
- **Don't put multiple output handles on a regular Activity** for branching. Branching is done by a Switch node, not by drawing two arrows out of an Activity. The only exception is the optional error-fallback handle (one extra outgoing arrow for the failure case, distinctly styled).
- **Don't expose Temporal- or engine-internal terminology** on the canvas — words like "ApimRequestId", "ctx", "Temporal", "schemaVersion", "Discriminated Union", "fallbackEdgeId" should never reach the user's eye. Translate everything into the language of the workflow domain (steps, nodes, branches, outputs, retries).
- **Don't require the user to write regular expressions** (or any expression syntax) directly in a text input. Where regexes are needed (e.g., split-by-keyword patterns, classification patterns), provide a structured builder *or* a clearly labeled "advanced regex" field with an in-place tester.
- **Don't conflate a node's static parameters with its input/output pickers.** They're different things and look similar. Static parameters are constants typed directly into the form; inputs/outputs are connections to upstream results or trigger inputs.
- **Don't make node groups feel like "regions" the engine respects.** They are decoration only, with the side-effect of exposing parameters. Make sure the visuals communicate "this is a label, not a container that affects execution" — except for the Loop node, which *is* a container that affects execution.

---

## 13. Open design questions for the designer

These are decisions that will shape the visual language. They are open questions — pick the answers that work best for the design system.

1. **Inline vs. side panel for node configuration.** Most automation tools use a slide-out panel from the right edge. Alternative: an inspector below the canvas. With deeply nested Loops, the inspector below approach can struggle. We lean toward right-side panel.
2. **How to draw a Loop's body.** Options: (a) the Loop is a big container the body nodes live inside (literally inside the rectangle), (b) the Loop is a regular-sized node and the body is shown in a sub-canvas you "enter into", (c) the Loop is a node and a soft-colored frame on the canvas surrounds its body. We lean toward (a) for simple cases, (b) for very complex bodies, with the user able to switch.
3. **How to surface "exposed parameters".** A separate management screen at the workflow level? An indicator on each exposed setting? Both?
4. **How to render conditions.** A purely visual condition builder for AND/OR/NOT trees can become unwieldy. Consider a hybrid: a structured row-by-row UI for simple conditions, with an "advanced" toggle that opens a tree-style editor for complex ones.
5. **How to handle very large workflows.** With 30+ nodes the canvas can become unreadable. Consider: minimap, search-by-node-label, "outline" panel listing nodes hierarchically, and good auto-layout.
6. **How to indicate "this connection is required" vs "this is optional".** Some node configurations have optional input slots (e.g., the optional `confidenceThreshold` on `ocr.enrich`). The settings panel should clearly distinguish required vs optional.

---

## 14. What this document deliberately does not cover

- The exact visual style (colors, typography, iconography) — those are design decisions.
- The information architecture of the broader product (where the builder sits in the app, login flow, navigation) — out of scope here.
- The mobile / small-screen experience — the builder is desktop-first.
- Internationalization specifics — content design / copy is a separate concern.

---

## 15. Pointers to companion documents

- [WORKFLOW_NODE_CATALOG.md](WORKFLOW_NODE_CATALOG.md) — every node in the system, with its full configuration form layout, in plain language. Use this as the spec for the per-node settings panels.
- [WORKFLOW_BUILDER_GUIDE.md](WORKFLOW_BUILDER_GUIDE.md) — earlier guide aimed at developers; still useful for understanding the underlying model.
- [WORKFLOW_NODE_IO_MODEL_DECISION.md](WORKFLOW_NODE_IO_MODEL_DECISION.md) — the engineering decision behind "single input, single output" (the reason every node has one in-arrow and one out-arrow apart from the special cases). Not designer-facing but explains why §6 looks the way it does.
- [`docs-md/graph-workflows/templates/multi-page-report-workflow.json`](../graph-workflows/templates/multi-page-report-workflow.json) — a real-world example of the kind of workflow the design must accommodate.
