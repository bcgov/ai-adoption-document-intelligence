# Workflow Node Architecture: Input/Output Model Decision

**Date:** 2026-04-27
**Status:** Analysis / recommendation
**Repo state analyzed:** branch `feature/reference-data-tables`, HEAD `2f21ba15`

This report analyzes the codebase to decide between **Model A** (single in / single out, n8n / make.com style) and **Model B** (multi-port typed I/O, ComfyUI style) for the visual workflow editor. Every claim cites a file path and line number. Where the codebase is silent, that is stated explicitly.

---

## TL;DR

**Recommendation: Model A (single input / single output) with two narrow exceptions kept from Model B's surface, both already encoded in the schema.**

The execution engine does not pass data through ports between nodes — data flows through a shared **context blackboard**, and named "ports" exist only as the *local* mapping between an activity's parameter names and context keys. There is **no typed wiring** between nodes anywhere in the engine; types on bindings are unenforced (`Record<string, unknown>` end-to-end). Every routing decision in the codebase today is made by `switch` nodes (or by `humanGate` / `errorPolicy` fallback edges); no Activity node currently produces multiple semantically distinct downstream branches. The one Activity that conceptually needs heterogeneous inputs — `document.validateFields` — sidesteps the problem by collapsing primary + attachments into a single `processedSegments: Array<...>` parameter, slicing position 0 as primary inside the activity ([apps/temporal/src/activities/document-validate-fields.ts:85-89](apps/temporal/src/activities/document-validate-fields.ts#L85-L89)).

The single-purpose split philosophy is therefore already how the codebase is built. Adopt Model A on the canvas. Keep two narrow concessions: (1) `switch` is a separate node type with N labelled outgoing edges, and (2) error-fallback edges (`type: "error"`) are first-class in the edge schema and must be drawable from any node with an `errorPolicy: "fallback"`.

---

## 1. Activity Type Inventory

Canonical registry: [apps/temporal/src/activity-registry.ts](apps/temporal/src/activity-registry.ts) (lines 60-356), constants at [apps/temporal/src/activity-types.ts:8-38](apps/temporal/src/activity-types.ts#L8-L38).

Every activity is invoked with a single `Record<string, unknown>` parameter object built from the node's `inputs[]` port bindings ([apps/temporal/src/graph-engine/node-executors.ts:147-165](apps/temporal/src/graph-engine/node-executors.ts#L147-L165)) and returns a single `Record<string, unknown>` result whose keys are pulled out by the node's `outputs[]` port bindings (lines 186-192). "Multiple inputs" and "multiple outputs" below mean *named keys on the parameter / result object* — not separate connection points.

| Activity | File:Line | Input keys | Output keys | Heterogeneous semantic inputs? | Branching outputs? |
|---|---|---|---|---|---|
| `file.prepare` | [prepare-file-data.ts:41](apps/temporal/src/activities/prepare-file-data.ts#L41) | `documentId`, `blobKey`, `fileName?`, `fileType?`, `contentType?`, `modelId?` | `preparedData` | No — all describe one file | No |
| `azureOcr.submit` | [submit-to-azure-ocr.ts:44](apps/temporal/src/activities/submit-to-azure-ocr.ts#L44) | `fileData`, `locale?` | `statusCode`, `apimRequestId`, `headers` | No | No |
| `azureOcr.poll` | [poll-ocr-results.ts:13](apps/temporal/src/activities/poll-ocr-results.ts#L13) | `apimRequestId`, `modelId` | `status`, `response?` | No | No |
| `azureOcr.extract` | [extract-ocr-results.ts:18](apps/temporal/src/activities/extract-ocr-results.ts#L18) | `apimRequestId`, `fileName`, `fileType`, `modelId`, `ocrResponse?` | `ocrResult` | No | No |
| `ocr.cleanup` | [post-ocr-cleanup.ts:9](apps/temporal/src/activities/post-ocr-cleanup.ts#L9) | `ocrResult` | `cleanedResult` | No | No |
| `ocr.checkConfidence` | [check-ocr-confidence.ts:10](apps/temporal/src/activities/check-ocr-confidence.ts#L10) | `documentId`, `ocrResult`, `threshold?` | `averageConfidence`, `requiresReview` | No (one doc + scalar config) | No (both outputs feed a downstream switch via ctx, no edge fan-out) |
| `ocr.enrich` | [enrich-results.ts:35](apps/temporal/src/activities/enrich-results.ts#L35) | `documentId`, `ocrResult`, `documentType`, `confidenceThreshold?`, `enableLlmEnrichment?` | `ocrResult`, `summary` | No | No |
| `ocr.spellcheck` | [ocr-spellcheck.ts:127](apps/temporal/src/activities/ocr-spellcheck.ts#L127) | `ocrResult`, `fieldScope?`, `language?` | `ocrResult`, `changes`, `metadata?` | No | No |
| `ocr.characterConfusion` | [ocr-character-confusion.ts:301](apps/temporal/src/activities/ocr-character-confusion.ts#L301) | `ocrResult`, `fieldScope?`, `documentType?`, `enabledRules?`, `disabledRules?`, `confusionMapOverride?`, `applyToAllFields?`, `confusionProfileId?` | `ocrResult`, `changes`, `metadata?` | No | No |
| `ocr.normalizeFields` | [ocr-normalize-fields.ts:453](apps/temporal/src/activities/ocr-normalize-fields.ts#L453) | `ocrResult`, `fieldScope?`, plus rule toggles | `ocrResult`, `changes`, `metadata?` | No | No |
| `ocr.storeResults` | [upsert-ocr-result.ts:13](apps/temporal/src/activities/upsert-ocr-result.ts#L13) | `documentId`, `ocrResult`, `enrichmentSummary?` | (void) | No | No |
| `document.updateStatus` | [update-document-status.ts:9](apps/temporal/src/activities/update-document-status.ts#L9) | `documentId`, `status`, `apimRequestId?` | (void) | No | No |
| `document.storeRejection` | [store-document-rejection.ts:9](apps/temporal/src/activities/store-document-rejection.ts#L9) | `documentId`, `reason`, `reviewer?`, `annotations?` | (void) | No | No |
| `document.split` | [split-document.ts:35](apps/temporal/src/activities/split-document.ts#L35) | `blobKey`, `groupId`, `strategy`, `fixedRangeSize?`, `customRanges?` | `segments` | No | No |
| `document.classify` | [classify-document.ts:31](apps/temporal/src/activities/classify-document.ts#L31) | `ocrResult`, `segment`, `classifierType`, `rules?` | `segmentType`, `confidence`, `matchedRule?` | Borderline — `ocrResult` + `segment` are two different objects but both refer to the same document, no swap risk | No |
| `document.splitAndClassify` | [split-and-classify-document.ts:46](apps/temporal/src/activities/split-and-classify-document.ts#L46) | `blobKey`, `groupId`, `ocrResult`, `keywordPatterns?` | `segments` (with type) | No | No |
| `document.validateFields` | [document-validate-fields.ts:77](apps/temporal/src/activities/document-validate-fields.ts#L77) | `processedSegments: Array<Record<string, unknown>>`, `documentId`, `rules?` | `validationResults` | **Conceptually yes** (primary + attachments), **structurally no** — collapsed into a single ordered array, position 0 is primary ([line 85-89](apps/temporal/src/activities/document-validate-fields.ts#L85-L89)) | No |
| `segment.combineResult` | [combine-segment-result.ts:37](apps/temporal/src/activities/combine-segment-result.ts#L37) | `currentSegment`, `segmentOcrResult` | `combinedSegment` | **Yes** — segment metadata and OCR result are not interchangeable | No |

### Other node types (control-flow, not activities)

Defined as a discriminated union at [apps/temporal/src/graph-workflow-types.ts:183-190](apps/temporal/src/graph-workflow-types.ts#L183-L190):

| Node type | File:Line | Inputs | Outputs / branching |
|---|---|---|---|
| `switch` | [graph-workflow-types.ts:112-121](apps/temporal/src/graph-workflow-types.ts#L112-L121) | `cases[].condition` reads ctx | **Multiple labelled outgoing edges**, one per `case.edgeId` + `defaultEdge` |
| `map` | [graph-workflow-types.ts:125-133](apps/temporal/src/graph-workflow-types.ts#L125-L133) | `collectionCtxKey` | One outgoing edge to `bodyEntryNodeId`; fan-out is internal (per-iteration branch ctx) |
| `join` | [graph-workflow-types.ts:137-142](apps/temporal/src/graph-workflow-types.ts#L137-L142) | `sourceMapNodeId` (implicit) | `resultsCtxKey` written to ctx; one outgoing edge |
| `childWorkflow` | [graph-workflow-types.ts:145-153](apps/temporal/src/graph-workflow-types.ts#L145-L153) | `inputMappings: PortBinding[]` | `outputMappings: PortBinding[]`; one outgoing edge |
| `pollUntil` | [graph-workflow-types.ts:157-166](apps/temporal/src/graph-workflow-types.ts#L157-L166) | Same as activity inputs | Same as activity outputs; one outgoing edge |
| `humanGate` | [graph-workflow-types.ts:170-179](apps/temporal/src/graph-workflow-types.ts#L170-L179) | Signal payload | **Two outgoing paths possible**: continue or `fallbackEdgeId` (only on `onTimeout: "fallback"`) ([node-executors.ts:438-453](apps/temporal/src/graph-engine/node-executors.ts#L438-L453)) |

**Activity-level error fallback** is also a branching path. When `errorPolicy.onError === "fallback"`, the engine selects `errorPolicy.fallbackEdgeId` instead of normal-flow edges ([apps/temporal/src/graph-engine/error-handling.ts:36-68](apps/temporal/src/graph-engine/error-handling.ts#L36-L68)). The edge schema reserves `type: "error"` for this ([graph-workflow-types.ts:202](apps/temporal/src/graph-workflow-types.ts#L202)) — but **no template currently uses an error edge** (see §6 below).

---

## 2. Direct Answers to the Five Questions

### Q1 — Branching outputs: does any current or planned activity produce multiple semantically distinct downstream paths?

**No Activity node does, and no planned Activity does.** All conditional routing in the codebase is done by separate `switch` nodes that *read* upstream output from ctx, evaluate a condition, and pick one outgoing edge ([apps/temporal/src/graph-engine/node-executors.ts:203-224](apps/temporal/src/graph-engine/node-executors.ts#L203-L224)). The clearest example is `ocr.checkConfidence`, which writes both `averageConfidence` and `requiresReview` to ctx, and a downstream `switch` reads `requiresReview` to decide between human review vs direct store ([standard-ocr-workflow.json](docs-md/graph-workflows/templates/standard-ocr-workflow.json)). Two routing-like behaviours that are *not* switches: (a) `errorPolicy.onError = "fallback"` selects an `error`-typed edge after retries are exhausted ([error-handling.ts:36-68](apps/temporal/src/graph-engine/error-handling.ts#L36-L68)), and (b) `humanGate` with `onTimeout: "fallback"` selects a `fallbackEdgeId` ([node-executors.ts:438-453](apps/temporal/src/graph-engine/node-executors.ts#L438-L453)). Both are **per-node policy attached to the node config**, not user-drawn branches off an activity. **Planned features don't change this** — `referenceData.lookup` produces a single `result` ([2026-04-22-reference-data-and-workspace-extensions-design.md §6.4](docs/superpowers/specs/2026-04-22-reference-data-and-workspace-extensions-design.md)) and `document.validateFields` produces a single `validationResults` object.

### Q2 — Heterogeneous inputs: does any activity consume multiple non-interchangeable inputs from different upstream sources?

**Structurally no — every activity is invoked with one parameter object.** The engine builds that object by spreading bindings then static parameters ([node-executors.ts:156-160](apps/temporal/src/graph-engine/node-executors.ts#L156-L160)) and the activity reads named keys. **Conceptually, two activities would benefit from heterogeneous wiring:** `segment.combineResult` (combines `currentSegment` metadata + `segmentOcrResult`) and `document.validateFields` (primary doc + attachments). Both currently get their multi-source inputs *via the shared context*: `currentSegment` is set by the enclosing `map` iteration, `segmentOcrResult` is set by an upstream activity inside the same iteration, and the enclosing `passthrough` activity in [multi-page-report-workflow.json](docs-md/graph-workflows/templates/multi-page-report-workflow.json) is what assembles them. `document.validateFields` ducks the problem entirely by accepting one `Array<Record<string, unknown>>` and treating index 0 as primary, indices 1+ as attachments ([document-validate-fields.ts:85-89](apps/temporal/src/activities/document-validate-fields.ts#L85-L89)). So the **codebase has decided that heterogeneous inputs go through ctx, not through wiring.**

### Q3 — Hidden wiring config: what data-passing decisions live only in code today?

Several. See §3 below for the full inventory. The headline items: (a) **the `port → ctxKey` map per node** is what actually wires data — but neither the engine nor any schema declares which ports an activity *expects* or *produces*, so the binding is validated only against ctx-key declarations, not against the activity's signature ([apps/temporal/src/graph-schema-validator.ts:399-436](apps/temporal/src/graph-schema-validator.ts#L399-L436)); (b) the **dot-notation namespacing** rules `doc.*` → `documentMetadata.*` and `segment.*` → `currentSegment.*` are hard-coded ([context-utils.ts:41-65](apps/temporal/src/graph-engine/context-utils.ts#L41-L65)); (c) `errorPolicy.fallbackEdgeId` and `humanGate.fallbackEdgeId` reference edge IDs by hand and are not surfaced as drawn branches; (d) `document.validateFields`'s primary-vs-attachment semantics is positional in an array, totally invisible to the wiring layer.

### Q4 — Type safety: are node I/O strongly typed?

**No.** The engine treats every activity parameter and every activity result as `Record<string, unknown>` ([node-executors.ts:156, 165](apps/temporal/src/graph-engine/node-executors.ts#L156)):
```ts
let activityParams: Record<string, unknown> = { ...inputs, ...node.parameters, ... };
const result = (await activityFn(activityParams)) as Record<string, unknown>;
```
The schema validator only checks that `binding.ctxKey` references a declared ctx key ([graph-schema-validator.ts:399-436](apps/temporal/src/graph-schema-validator.ts#L399-L436)), and that activity types are registered (lines 282-309). There is **no check** that an activity actually produces `binding.port`, or that the type of the value at `ctxKey` matches what the activity expects. TypeScript catches *schema* mistakes (a `MapNode` must have `bodyEntryNodeId`, etc.) but not *wiring* mistakes (you can wire any port to any ctxKey of any type). The reference-data spec adds types on lookup *parameters* ([2026-04-22-reference-data-and-workspace-extensions-design.md §5.1-5.2](docs/superpowers/specs/2026-04-22-reference-data-and-workspace-extensions-design.md)), but they are coerced/checked inside the activity at runtime, not at wiring time.

### Q5 — Single-purpose split feasibility: is Inderdeep's proposal actually feasible for every activity?

**Yes for every existing activity.** The codebase is already organized this way — each activity does one thing, multi-source data is plumbed through ctx, and routing is delegated to `switch`. Walking the list:

- All file/OCR/post-processing/storage activities (file.prepare → ocr.storeResults) are pure 1-in / 1-out chains.
- `ocr.checkConfidence` writes two ctx vars but only has one outgoing edge in every template — a downstream `switch` is what fans out.
- `document.split`, `document.classify`, `document.splitAndClassify`, `document.validateFields` all take one parameter object and return one result object.
- `segment.combineResult` is the activity that does the assembly job — it's *the* split-into-single-purpose-node solution to "I need OCR + metadata together." It's already a separate node ([combine-segment-result.ts:37](apps/temporal/src/activities/combine-segment-result.ts#L37)) and already used at the natural place ([multi-page-report-workflow.json](docs-md/graph-workflows/templates/multi-page-report-workflow.json) `passthrough` node).
- `switch`, `map`/`join`, `childWorkflow`, `pollUntil`, `humanGate` are control-flow nodes, not activities — Model A doesn't apply to them; they have intrinsic shapes.

The only awkward case is `humanGate` + `errorPolicy = fallback`, which by their nature have two outgoing paths. Those are **already declared at the node level** (not by drawing a second activity-style port), so they fit the spirit of A: the user *configures* the fallback, they don't draw a "second output."

---

## 3. Hidden-in-Code Wiring Inventory (must surface in the UI under either model)

Every place where data-flow / routing behaviour is hardcoded rather than declared in a schema the UI could consume:

1. **Per-node `inputs[]` / `outputs[]` `PortBinding[]` lists** are the actual wiring (`{ port, ctxKey }`) — but the *valid set of ports* for each activity type is implicit in the activity's TypeScript input/output interfaces and not exposed in any registry the UI can introspect. UI today: the user types port names as strings into a config form ([apps/frontend/src/components/workflow/GraphConfigFormEditor.tsx:615-689](apps/frontend/src/components/workflow/GraphConfigFormEditor.tsx#L615-L689)).
2. **Ctx-key namespace rewriting** — `doc.*` → `documentMetadata.*` and `segment.*` → `currentSegment.*` is hardcoded in [context-utils.ts:41-65](apps/temporal/src/graph-engine/context-utils.ts#L41-L65) and [context-utils.ts:70-98](apps/temporal/src/graph-engine/context-utils.ts#L70-L98). Users typing `segment.blobKey` won't realize this is special syntax.
3. **`errorPolicy.fallbackEdgeId`** is a free-text edge-id reference inside the node config ([graph-workflow-types.ts:81-86](apps/temporal/src/graph-workflow-types.ts#L81-L86)). The error edge itself uses `type: "error"` ([graph-workflow-types.ts:202](apps/temporal/src/graph-workflow-types.ts#L202)) but no template uses one yet.
4. **`humanGate.fallbackEdgeId`** — same pattern, free-text edge reference ([graph-workflow-types.ts:178](apps/temporal/src/graph-workflow-types.ts#L178)).
5. **`switch` cases reference outgoing edges by ID** (`SwitchCase.edgeId`) and the `defaultEdge` field also references an edge ID ([graph-workflow-types.ts:112-121](apps/temporal/src/graph-workflow-types.ts#L112-L121)). The user must keep `cases[].edgeId` consistent with actual `edges[].id`. The schema validator catches dangling references ([graph-schema-validator.ts](apps/temporal/src/graph-schema-validator.ts)) but the UI must enforce or auto-generate this.
6. **`map.bodyEntryNodeId` / `bodyExitNodeId`** are node-id references ([graph-workflow-types.ts:131-132](apps/temporal/src/graph-workflow-types.ts#L131-L132)) — the implicit subgraph boundary lives in two strings, not in a containment relationship the canvas could render natively.
7. **`join.sourceMapNodeId`** — a node-id reference back to the partner Map ([graph-workflow-types.ts:139](apps/temporal/src/graph-workflow-types.ts#L139)). Pairing is by string match, not by drawn edge.
8. **`childWorkflow.workflowRef`** — either a library workflow ID or an inline graph; the input/output bindings (`inputMappings`, `outputMappings`) are positional in the config and have no schema-level link to the child's declared `ctx` ([graph-workflow-types.ts:145-153](apps/temporal/src/graph-workflow-types.ts#L145-L153)).
9. **`document.validateFields` positional semantics**: index 0 of `processedSegments` is "primary," 1+ are "attachments" ([document-validate-fields.ts:85-89](apps/temporal/src/activities/document-validate-fields.ts#L85-L89)). Invisible to the UI; only inspectable by reading the activity source.
10. **`pollUntil` exit condition** — a `ConditionExpression` reading ctx, evaluated *after* each attempt's outputs are written ([node-executors.ts:380-385](apps/temporal/src/graph-engine/node-executors.ts#L380-L385)). The condition references ctx keys that the activity has just written; this dependency between the activity's output bindings and the loop-exit condition is implicit.
11. **`humanGate` payload → ctx writeback default**: if no `outputs[]` is declared, the engine writes the entire signal payload to `${node.id}Payload` in ctx ([node-executors.ts:466-472](apps/temporal/src/graph-engine/node-executors.ts#L466-L472)). Hidden default ctx key.
12. **Map per-iteration ctx is a shallow copy of the parent ctx** ([node-executors.ts:262-269](apps/temporal/src/graph-engine/node-executors.ts#L262-L269)). Isolation semantics that affect what activities inside the loop see; not declared anywhere the UI could surface.
13. **Implicit normal-edge selection**: when a node has no `selectedEdges` entry, all `type: "normal"` outgoing edges are taken ([graph-algorithms.ts:90-186](apps/temporal/src/graph-engine/graph-algorithms.ts#L90-L186)). So a regular Activity with two normal outgoing edges = parallel fan-out. **No template uses this**, but the engine permits it. Either the UI prevents it (Model A) or surfaces it explicitly.

---

## 4. Recommendation

**Adopt Model A on the canvas, with three concessions encoded as separate node features rather than as user-drawn typed ports.**

### What "Model A" means here, concretely

- An Activity node has **one input handle (left) and one output handle (right)**, both untyped and unnamed in the canvas UI.
- "Inputs" and "outputs" of the activity are configured in the node side panel as a list of `port → ctxKey` rows (the `PortBinding` model already in the schema). Multiple ctx vars per activity is fine; they all enter through the single input handle.
- Multiple upstream activities can fan into one input handle. That already works because the engine's "multi-input" semantics is `{ ...inputs, ...parameters }` (last-write-wins on the parameter object) and the cross-activity hand-off is via ctx, not via wires. Three predecessors writing different ctx keys behave identically to one predecessor doing it.
- The user does **not** draw "primary doc" vs "reference doc" wires. Heterogeneous inputs are read from ctx by name in the side panel, the same way the codebase already works.

### The three concessions to keep

These are *node features*, not *typed ports*. The user picks a node type and configures it; the canvas renders the extra outgoing paths:

1. **`switch` is a distinct node type with N labelled outgoing edges.** The user declares cases in the side panel; the canvas renders one outgoing edge per case + a default. This is what the schema already encodes ([graph-workflow-types.ts:112-121](apps/temporal/src/graph-workflow-types.ts#L112-L121)) and what every routing template uses today.
2. **Error fallback edges**, drawn as `type: "error"` (red dashed) ([graph-workflow-types.ts:202](apps/temporal/src/graph-workflow-types.ts#L202)). Available **only** when the activity's `errorPolicy.onError` is set to `"fallback"`. The schema already supports it; no template uses it yet, but the design doc plans for it ([WORKFLOW_BUILDER_GUIDE.md:200, 391-403](docs-md/WORKFLOW_BUILDER_GUIDE.md#L200)).
3. **`humanGate` timeout-fallback edge**, an extra outgoing edge appearing only when `onTimeout: "fallback"` is selected. Mechanism mirrors error fallback; already in the schema ([graph-workflow-types.ts:178](apps/temporal/src/graph-workflow-types.ts#L178)).

### Why not full Model B

- **The execution engine doesn't pass data through ports.** It passes data through `ctx`. ([node-executors.ts:147-192](apps/temporal/src/graph-engine/node-executors.ts#L147-L192)). Adding typed wires would create a UI fiction the engine doesn't honor.
- **Activities aren't typed at the registry level.** Adding port-typed wiring would require a parallel "activity I/O contract" registry that doesn't exist today; that's a substantial addition for zero current ROI.
- **No Activity in the codebase produces semantically distinct branches.** All branching is `switch` / error / humanGate. Multi-port outputs would be drawing handles for paths that don't exist.
- **The single-purpose split is already the codebase's discipline.** `segment.combineResult` exists *because* the answer to "I need two things together" was "make a small assembler activity." Adding ComfyUI-style multi-port nodes would invite developers to abandon that discipline.
- **The frontend canvas today is read-only** — handles use `isConnectable={false}` ([apps/frontend/src/components/workflow/GraphVisualization.tsx:202, 209, 216, 223](apps/frontend/src/components/workflow/GraphVisualization.tsx#L202)). Picking Model A means the build target is "make handles connectable," which is straightforward. Picking Model B means designing a typed-port system that the engine must then learn to enforce — a much bigger lift.

### Why not pure A

The two `fallback` cases (errorPolicy + humanGate.onTimeout) and `switch`'s N outgoing edges are not wishes; they are encoded in the schema and used (or designed-for) in the engine today. Pretending the canvas only has 1-out would force the user to express conditional routing through some other mechanism, which would be worse than just letting `switch` and conditional fallback nodes draw their extra edges.

### What to keep from Model B's *philosophy*

- **Edges have a `type` field** (`"normal" | "conditional" | "error"`) and the canvas should render them differently — already in the schema ([graph-workflow-types.ts:202](apps/temporal/src/graph-workflow-types.ts#L202)).
- **Edges may carry a `sourcePort`/`targetPort`** ([graph-workflow-types.ts:199-201](apps/temporal/src/graph-workflow-types.ts#L199-L201)). For Model A, leave these unused for Activity nodes; for `switch`, use `sourcePort` to identify which case the edge belongs to (currently encoded via `cases[].edgeId` instead — see migration notes §6).
- **Save-time validation against ctx declarations is already done** ([graph-schema-validator.ts:399-436](apps/temporal/src/graph-schema-validator.ts#L399-L436)). Surfacing those errors as inline UI badges is the analog of Model B's "type mismatch is an error."

---

## 5. Kill Criteria

Activities (current or planned) that would be **impossible or awkward** to express in Model A. **The list is empty for activities.** Three control-flow features need first-class extra edges, all already in the schema:

- `switch` — multiple labelled outgoing edges. Fits the model as a *node feature*, not a wiring feature.
- `humanGate` with `onTimeout: "fallback"` — second outgoing edge. Same.
- Activity / pollUntil / humanGate with `errorPolicy.onError: "fallback"` — error edge. Same.

If a future activity needed truly heterogeneous typed inputs that *could not* be assembled by ctx (e.g., two large binary streams that the activity must *not* materialize through ctx), that would force Model B. **No such activity exists or is planned.** The reference-data lookup design (commit 071e95e5, [2026-04-22-reference-data-and-workspace-extensions-design.md](docs/superpowers/specs/2026-04-22-reference-data-and-workspace-extensions-design.md)) types its lookup *parameters*, but those are scalar params, not separate streams; they fit Model A as additional `port → ctxKey` rows. Cross-document validation (`document.validateFields`, US-019) is already designed around an array-of-segments parameter and explicitly avoids primary-vs-reference port semantics.

**Conclusion: Model A is viable.**

---

## 6. Migration / Refactor Notes

The current schema and engine *already* match Model A. Most of the work is removing fictional UI affordances and surfacing the three legitimate exceptions cleanly.

### Schema (no changes needed; possibly small clarifications)

- Optional cleanup: `SwitchCase.edgeId` references an edge ID ([graph-workflow-types.ts:118-121](apps/temporal/src/graph-workflow-types.ts#L118-L121)). Cleaner UX would be to encode the case-id on the **edge** via `sourcePort` (already supported, [line 199](apps/temporal/src/graph-workflow-types.ts#L199)), rather than on the switch's `cases[].edgeId`. Optional refactor; current shape works.
- Document the implicit `doc.*` / `segment.*` namespace rewrite ([context-utils.ts:41-65](apps/temporal/src/graph-engine/context-utils.ts#L41-L65)) somewhere user-visible, or remove it in favor of explicit ctx keys. As-is, it's a hidden dialect.

### Engine (no changes needed)

The engine's "shared ctx + named-key parameter object" model *is* Model A. The only engine-relevant follow-on is refusing to allow an Activity to have >1 outgoing `type: "normal"` edge — currently permitted (would silently fan out, [graph-algorithms.ts:90-186](apps/temporal/src/graph-engine/graph-algorithms.ts#L90-L186)). A schema validator rule "Activity nodes have exactly one normal outgoing edge (plus optional error/fallback edges)" would lock the discipline into the engine.

### Frontend (the actual work)

- **Make handles connectable.** Today: `isConnectable={false}` on every handle ([GraphVisualization.tsx:202, 209, 216, 223](apps/frontend/src/components/workflow/GraphVisualization.tsx#L202)). For Model A: enable the right-handle as `source` and left-handle as `target` for Activity / pollUntil / childWorkflow / map (entry side) / join (entry side). Drop the top/bottom handles entirely (they're visual-routing artifacts that have no place in user-driven wiring).
- **Switch nodes**: render a fan of N + 1 source handles on the right (or below), one per case + default, each labelled. Auto-create / auto-link `cases[i].edgeId` ↔ outgoing edge ID when the user draws the edge.
- **Error edges**: only allow drawing an `type: "error"` edge from a node whose `errorPolicy.onError === "fallback"`. UI affordance: a small red "fallback" handle that appears when the user enables fallback in the node panel.
- **HumanGate**: same pattern — only show the fallback handle when `onTimeout === "fallback"`.
- **Activity panel side panel**: keep the existing `port → ctxKey` editor ([GraphConfigFormEditor.tsx:615-689](apps/frontend/src/components/workflow/GraphConfigFormEditor.tsx#L615-L689)), but when an activity registry with declared ports lands (future), turn the `port` field into a select instead of a free-text input. Out of scope for the initial Model A canvas.
- **Validation surfacing**: pipe the existing schema validator output ([graph-schema-validator.ts](apps/temporal/src/graph-schema-validator.ts)) into per-node and per-edge badges on the canvas. The validator already knows about dangling edge references, undeclared ctx keys, and unregistered activity types — surface them.

### What this report does **not** decide

- Whether the `port → ctxKey` editor in the side panel should eventually become a typed dropdown driven by an activity I/O registry. That's a Model-B-flavored enhancement to the *side panel*, not to the *canvas*; deferred until an activity registry with declared port shapes exists. None exists today.
- Whether to introduce CEL ([DAG_WORKFLOW_ENGINE.md §14.5](docs-md/graph-workflows/DAG_WORKFLOW_ENGINE.md)) for switch conditions. Orthogonal to the I/O model question.
