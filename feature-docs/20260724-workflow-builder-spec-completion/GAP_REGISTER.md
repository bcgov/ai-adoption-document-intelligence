# Workflow Builder — Gap Register

Merged output of the four discovery passes (design §4). Ranked by corroboration,
then severity, then breadth.

**Source:** `findings-{a,b,c,d}.json` · **Scope:** MANUAL_TEST_PLAN Parts 3–9 · **Branch:** `feature/visual-workflow-builder`

Every source finding id appears in exactly one entry below; nothing was dropped and nothing
was re-adjudicated. Each pass's `disposition` is preserved as the **proposed** value — where
merged sources disagree, the disagreement is stated rather than resolved. Disposition is
Alex's call at the next gate.

## Approved dispositions (2026-07-25)

The disposition gate ran over the **27 entries that are either a blocker or corroborated by
2+ independent passes**. Alex ruled on the three clusters carrying a genuine scope judgement;
every other entry keeps the disposition its pass proposed, and any of those may still be
overridden when the implementation plan lands.

| Decision | Entries | Ruling |
|---|---|---|
| Run architecture | **G-021**, **G-026** | **fix now** — these are bugs, not missing features. G-021 needs one discriminator on the cancel predicate; G-026 is `Promise.all` where `allSettled` belongs. |
| Run architecture | **G-023**, **G-025**, **G-006** | **defer** — batch, multi-file intake and the map threshold become a separate tracked epic with its own plan. |
| Step output visibility | **G-022** | **fix** — extracted values must be visible in the builder. An author who cannot see what a step produced cannot tell whether the workflow works, and it is the whole method behind the debugging journey. |
| Durability | **G-003** | **fix, full undo/redo** — not the cheaper confirm-before-destroy mitigation. |

Architectural findings stay in this register regardless of which layer owns the fix, and are
dispositioned per item rather than split into a separate track.

**Net for the 27 gated entries: 24 fix, 3 defer.**

## Summary

| Pass | Findings | Blocker | Major | Minor |
|---|---|---|---|---|
| A | 38 | 11 | 18 | 9 |
| B | 27 | 3 | 15 | 9 |
| C | 52 | 1 | 25 | 26 |
| D | 37 | 5 | 26 | 6 |
| **Source total** | **154** | **20** | **84** | **50** |
| **Merged** | **103** | **16** | **56** | **31** |

154 source findings merge to **103 entries**: 86 single-pass and **17 corroborated by two or more independent passes** (1 by three). No gap was found by all four — the passes' axes were disjoint enough that a 4-way hit was never likely.

Merged severity is the **maximum** severity across a cluster's sources, which is why the merged
blocker count (16) is lower than the source blocker count (20) — several blockers merged with each other,
and two merged with lower-severity sightings of the same defect.

> One source finding, **C-041** ("active-edge animation is dead code"), was withdrawn by Pass C
> during re-verification before this merge and does not appear in `findings-c.json`. It rested on a
> silent-empty `grep` against a file the tool classifies as binary — see G-073.

## Corroborated findings

Gaps found independently by two or more passes, in rank order. The passes could not see each
other's output, so agreement here is the strongest priority signal in the register.

| # | Passes | Sev | Gap | Source findings |
|---|---|---|---|---|
| G-001 | **A, B, D** (3) | blocker | `errorPolicy` has no authoring surface at all — one of the three modelled edge flavours is unreachable,… | A-010, B-009, D-004 |
| G-002 | **B, D** (2) | blocker | A ctx key whose producer or declaration is gone still reads as satisfied on every surface — authoring,… | B-010, D-002, D-016 |
| G-003 | **B, D** (2) | blocker | No undo/redo anywhere, and the destructive actions that most need it ask nothing — while the least… | B-001, B-002, B-027, D-011, D-024 |
| G-004 | **A, D** (2) | blocker | The run overlay is painted by node id onto whatever graph is on screen — Replay never loads the run's… | A-027, D-037 |
| G-005 | **C, D** (2) | blocker | The `locked` short-circuit in `resolveInputPort` skips every check — a pin to a deleted producer, or to an… | D-001, C-032 |
| G-006 | **A, C** (2) | blocker | Above 20 collection items a map runs a different program: the child workflow re-enters at `entryNodeId`… | A-017, C-001 |
| G-007 | **A, C** (2) | major | Control-flow and source nodes have no declared output ports, so nothing downstream of them can be… | A-022, C-027, C-012 |
| G-008 | **B, D** (2) | major | The ctx-key rename sweep is not exhaustive — library port paths and source-node produced keys are silently… | B-011, D-013, D-014 |
| G-009 | **A, B** (2) | major | There is no way to find a node in a graph, and no way to ask what else reads a value — the only search in… | A-026, B-005 |
| G-010 | **B, C** (2) | major | Clicking a validation issue selects a node the drawer cannot make stick, never brings it into view, and… | B-006, C-060, C-068 |
| G-011 | **B, C** (2) | major | The preview shows the first output only, covers about a third of the registered kinds, and renders a blank… | B-016, C-045, C-046, C-047 |
| G-012 | **B, C** (2) | major | "This step didn't run" is one prose string standing in for four different situations — and it is not shown… | B-017, C-044, C-043 |
| G-013 | **C, D** (2) | major | The map's `collection` binding sits outside the six-state binding model and is never re-resolved once set… | C-026, D-020 |
| G-014 | **A, C** (2) | major | The path a run actually took is never rendered: in replay no edge is ever highlighted, and some legally… | A-034, C-052 |
| G-015 | **B, C** (2) | major | An inline child graph is a full `GraphWorkflowConfig` with neither a visual editor nor a validator — every… | B-014, C-009 |
| G-016 | **C, D** (2) | minor | A `pollUntil` node renders through the control-flow rectangle path and therefore loses every activity… | C-015, D-026 |
| G-017 | **A, C** (2) | minor | humanGate signal names: the palette ships an unvalidated empty default, and three of the four offered… | A-023, C-007 |

## Findings

### G-001 — `errorPolicy` has no authoring surface at all — one of the three modelled edge flavours is unreachable, and a config that arrives with it set can never be saved again

**Found by:** A, B, D (3 passes) · **Severity:** blocker · **Type:** impl-gap
**Surfaces:** canvas:node-handle, canvas:wire, edge-picker, node-menu, settings-panel, settings-panel:params, topbar:validation-button, validation-drawer
**Source findings:** A-010, B-009, D-004
**Evidence:** apps/temporal/src/graph-engine/error-handling.ts:24 · apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx:592 · packages/graph-workflow/src/validator/validator.ts:348

Three passes converged on the same hole, and INVENTORY §5.11 flagged it as unresolvable before any of them ran. The engine implements all three `onError` modes (`fail` / `fallback` / `skip`) and honours `retryable: false`; the canvas mounts the bottom `error` source handle only when `errorPolicy?.onError === "fallback"`; the validator requires `fallbackEdgeId` when it is; `swapNodeType` carefully carries the field through; and `EdgePicker` — the exact widget required — names `errorPolicy.fallbackEdgeId` in its own doc comment. Nothing in the frontend ever *writes* `errorPolicy`, and `control-flow-skeletons.ts` never seeds it. Four consequences compound:
1. **The `error` edge type is unauthorable.** The handle is gated on a field the editor cannot set, so on any editor-authored node an error edge cannot be drawn at all — one of the three `GraphEdge.type` flavours the model defines is unreachable from the product.
2. **An unclearable red validation state.** If a config arrives with `onError: "fallback"` (agent, API, or template), dragging from the error handle stamps `type: "error"` on the new edge but never writes `errorPolicy.fallbackEdgeId`, so the validator permanently reports `Node "<id>" requires fallbackEdgeId when onError is "fallback"` — and the anchor routes the user to a settings panel with no errorPolicy section.
3. **An unrecoverable cascade.** No delete path sweeps `errorPolicy.fallbackEdgeId` (not the edge filter in `removeNodesFromConfig`, not `deleteSelected`, not the direct-edge-delete branch of `handleDelete`), the backend rejects the save, and edge ids are randomly minted — so the referenced id can never be recreated. Pass D calls this the one cascade that is genuinely unrepairable inside the builder: the workflow opens but can never be saved again.
4. **No failure containment in any journey.** Marcus's stated requirement — "the unreadable files set aside with their reason recorded and the remaining 228 finishing normally, described once in the workflow" — has no expression, and J4 step 7 dies with it. `RetryPolicy` and `TimeoutPolicy` are in exactly the same state.

**Proposed disposition:** fix

**Merge note:** The three passes reached this from journeys (A), an editor-obligation roster (B) and a delete-cascade table (D) with no visibility of each other. It is the only 3-pass agreement in the register.

### G-002 — A ctx key whose producer or declaration is gone still reads as satisfied on every surface — authoring, validation and rendering all miss it

**Found by:** B, D (2 passes) · **Severity:** blocker · **Type:** design-gap + impl-gap
**Surfaces:** canvas:node-badge, canvas:wire, settings-panel:child-workflow, settings-panel:inputs, settings-panel:join, settings-panel:map, validation-drawer, validation-engine, validation:auto-wire, workflow-settings
**Source findings:** B-010, D-002, D-016
**Evidence:** apps/frontend/src/features/workflow-builder/settings/WorkflowSettingsDrawer.tsx:187 · packages/graph-workflow/src/validator/validator.ts:1474 · packages/graph-workflow/src/validator/validator.ts:671

Three facets of one failure, found from two directions.
1. **Authoring.** `deleteKey` is a two-line object-rest removal fired straight from a bare trash `ActionIcon` with no guard, no usage count and no reverse lookup. The asymmetry inside one component is the tell: the sibling operation, rename, is backed by a full graph sweep, and the drawer advertises it in body copy — "Renaming a key rewrites every binding that references it". Delete gets none of that.
2. **Validation.** `walkCtxKeyBindings` bails with `if (producers.length === 0 || consumers.length === 0) continue;` — a key that nothing writes is never type-checked and never reported. The undeclared-key check only asserts a *declaration* exists, not a producer, and nothing prunes `config.ctx` when a node is deleted. Worse, `validatePortBindings` walks only `node.inputs` / `node.outputs`: `map.collectionCtxKey`, `map.indexCtxKey`, `join.resultsCtxKey` and childWorkflow input/output mappings are never checked for declaration at all, and the whole walk early-returns when `config.ctx` is absent, so a source-driven workflow with no declarations gets no binding validation whatsoever.
3. **Rendering.** `autoWireIssuesToValidationErrors` explicitly excludes ports bound to a real (non-`__auto`) ctx key from the "needs a source" warning, and `effectiveResolution` renders them in the display-only `ctx-bound` state reading "from `<key>`".

Net: delete the sole producer of a hand-authored ctx key — or the declaration itself — and every consumer still reads as satisfied on every surface, the workflow saves clean, and it fails at run time. "Producer-less ctx key" is a state the model can reach that the design never named. Pass B's cheap-fix suggestion stands on its own: the rename sweep is already written, so enumerating references before deleting is close to free.

**Proposed disposition:** fix

### G-003 — No undo/redo anywhere, and the destructive actions that most need it ask nothing — while the least destructive one is the only guarded action

**Found by:** B, D (2 passes) · **Severity:** blocker · **Type:** design-gap + impl-gap
**Surfaces:** canvas, node-menu, page-shell, settings-panel, settings-panel:group, settings-panel:params, widget:classification-rule, widget:validation-rule, workflow-settings
**Source findings:** B-001, B-002, B-027, D-011, D-024
**Evidence:** apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx:730 · apps/frontend/src/features/workflow-builder/settings/group/GroupNodeSettings.tsx:190 · apps/frontend/src/features/workflow-builder/json-schema-form/JsonSchemaForm.tsx:212

Both passes verified independently that the feature contains **no undo code whatsoever** — no history stack, no command object, no snapshot ring, no Ctrl+Z handler. `setConfig` is a raw React `useState` setter threaded through every mutation path, and every mutating surface (canvas connect, port drag-to-bind, delete, auto-arrange, node swap, ctx rename, ctx delete, group create/delete, every settings form) calls `onConfigChange` with a whole new config and discards the previous one. (Pass B corrected the pre-supplied probe here: the two apparent `undo|redo` hits are a comment and the substring `decla`**`redO`**`utputs`.)

Behind that absence sit three unguarded destructive paths. Node deletion has three entry points — the settings-panel trash button, the context menu, and bare Delete/Backspace on the canvas, which also deletes a whole multi-selection — and none of them asks; each silently discards the node, every edge touching it, its group membership, any exposedParams pointing at it, and, if it was the entry node, repoints `entryNodeId` at an arbitrary surviving key. Changing a discriminated-union parameter's discriminator drops every sibling field by design, delivered through an ordinary Select with no confirm and no summary of what is being discarded. And the guard policy is exactly inverted: deleting a **group** — which destroys only a presentation grouping — is the one action that pops a `window.confirm`, whose biome-ignore comment asserts a house pattern for accidental-deletion guards that does not exist anywhere else (deleting a whole *workflow* does use a proper Mantine modal, on the list page).

Consequence: one mis-aimed Backspace, or one mis-click in a strategy dropdown, destroys an arbitrary amount of hand-authored rich-widget work — classification rules, validation rules, confusion maps — with no way back short of never pressing Save. Both passes note this is the load-bearing safety property of a direct-manipulation graph editor, that every other destructive finding in this register is only tolerable behind it, and that it cannot be retrofitted cheaply once more surfaces mutate config directly.

**Proposed disposition:** fix

**Merge note:** **Theme, not a single gap (5 source findings).** At least two decisions live here: (i) build a history stack, and (ii) pick one confirmation pattern and apply it by blast radius. B-002 and D-011 both say fixing (i) largely dissolves (ii).

### G-004 — The run overlay is painted by node id onto whatever graph is on screen — Replay never loads the run's version, and stale statuses are never pruned

**Found by:** A, D (2 passes) · **Severity:** blocker · **Type:** impl-gap
**Surfaces:** preview-widget, preview:query, run-history-drawer, run-row, run-state, run-status-badge, run:active-edges, topbar:replay-indicator
**Source findings:** A-027, D-037
**Evidence:** apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx:1526 · apps/frontend/src/features/workflow-builder/run/RunStateContext.tsx:70

`handleReplay` does exactly `setActiveRunId(runId); setIsReplay(true); onClose();` — it never fetches `run.workflowVersionId` and never reloads `config`, even though `RunSummaryDto` carries the version id and `run-row` already renders it as a `v3 — head` pin. The information is on screen and deliberately unused. Independently, `RunStateContext` reads the raw server response as `nodeStatuses[nodeId] ?? PENDING_STATUS`; nothing removes entries for nodes that no longer exist, the preview batch endpoint returns every fresh row without filtering against the current config, and the only `setActiveRunId(null)` is the replay-exit path — so editing the graph does not end the run overlay.

Consequence: statuses and previews land on nodes that did not exist in that run and vanish for nodes that have been renamed, with no warning. Crossed with node-id reuse (see the cache-collision entry), a brand-new node renders the deleted node's success badge and its cached preview **before it has ever run** — which is precisely the corroboration a user would use to believe a wrong cache hit. J7 step 2 is categorical about the requirement: "a diagnosis against the current version would be worthless." The settings panel's own replay Alert ("changes will not affect the displayed historical preview") confirms the editor knowingly stays on the live config.

**Proposed disposition:** fix

### G-005 — The `locked` short-circuit in `resolveInputPort` skips every check — a pin to a deleted producer, or to an incompatible kind, reports as healthy

**Found by:** C, D (2 passes) · **Severity:** blocker · **Type:** design-gap + impl-gap
**Surfaces:** canvas:node-badge, canvas:port-rows, canvas:wire, settings-panel:inputs, validation-drawer, validation:auto-wire
**Source findings:** D-001, C-032
**Evidence:** packages/graph-workflow/src/auto-wire/resolve-input-port.ts:62 (both passes landed on the same line)

`resolveInputPort` returns `{status:"locked", ctxKey}` straight off the lock list — before it looks up the producer that `__auto.<nodeId>.<port>` names, and before it ever reads `port.kind`. `computeNodeInputIssues` treats only `ambiguous` / `unsatisfied` / `locked-unbound` as problems, so both failures roll up as `ok`: no badge, no drawer row, no warning. `resolvePinnedSource` even has a documented branch for the deleted-producer case and chooses to render the raw `__auto.…` key as the source label rather than flag it. The workflow saves clean and the engine injects `undefined` for that port at run time.

Pass D found the producer-existence half — nothing catches it anywhere. Pass C found the kind half, and rates it lower because the workflow-level binding walk does eventually catch an incompatible pin (after the debounce, at the workflow level, never turning the row red). Same line, same short-circuit, two different halves of the damage.

**Proposed disposition:** fix (D-001) / defer (C-032) — **passes disagree**

**Merge note:** **Dispositions disagree:** D proposes `fix` (blocker — silently destructive with no design-time signal); C proposes `defer` (minor — the binding walk provides a late backstop for the kind case). The disagreement is about which half you look at; the producer-existence half has no backstop at all.

### G-006 — Above 20 collection items a map runs a different program: the child workflow re-enters at `entryNodeId` instead of the body, and no body node's status ever reaches the parent

**Found by:** A, C (2 passes) · **Severity:** blocker · **Type:** design-gap + impl-gap
**Surfaces:** canvas:map-body-box, run-state, run-status-badge, run:polling, settings-panel:map
**Source findings:** A-017, C-001
**Evidence:** apps/temporal/src/graph-engine/node-executors.ts:601 · apps/temporal/src/graph-engine/node-executors.ts:613

`useChildWorkflows = collection.length > MAP_CHILD_WORKFLOW_THRESHOLD (20) && workflowVersionId !== undefined`. Two independent defects sit behind that one predicate.
1. **Semantics flip on collection size.** The branch is dispatched as a child `graphWorkflow`, and `GraphWorkflowInput` carries no entry/exit override — so the child re-enters at `config.entryNodeId` and `bodyEntryNodeId` / `bodyExitNodeId` are silently ignored. Pass C's whole nesting grid inherits this: **nothing nested inside a map body is specified above 20 items.**
2. **No progress signal of any kind.** Each iteration runs as a separate Temporal execution and the parent's `nodeRunStatuses` map is not shared with it, so `GET /:id/runs/:runId/node-statuses` reports nothing for any body node. Below the threshold `executeBranchSubgraph` does share the parent map but keys statuses by node id — its own comment says "Map subgraphs nest the same node ids across iterations — the last iteration's status wins". Either way the map node itself sits on `running` for the whole fan-out, and there is no iteration counter anywhere on the canvas.

Marcus's 40–300-page documents always take the child path, so J4 step 6 — "tell whether it is progressing and roughly how far along it is" — has no surface at all. Neither pass verified this at runtime; Pass A explicitly asks for one live 25-item map to confirm the canvas really shows nothing.

**Proposed disposition:** fix → **APPROVED: defer**
**Approval note (2026-07-25):** Deferred to the batch epic. The map child-workflow threshold is engine behaviour, not an authoring-surface defect; it is only reachable at a collection size the deferred multi-file/batch work would introduce.

**Merge note:** **Two defects, probably two fixes.** Filed as one entry because they are the same branch and the same threshold, and because fixing observability without fixing the entry-point bug would report progress on the wrong subgraph.

### G-007 — Control-flow and source nodes have no declared output ports, so nothing downstream of them can be auto-wired — and a reviewer's payload cannot even be named

**Found by:** A, C (2 passes) · **Severity:** major · **Type:** design-gap + impl-gap
**Surfaces:** canvas:port-rows, canvas:wire, producer-picker, settings-panel:advanced-bindings, settings-panel:human-gate, settings-panel:inputs, settings-panel:map, variable-picker
**Source findings:** A-022, C-027, C-012
**Evidence:** packages/graph-workflow/src/auto-wire/resolve-input-port.ts:213 · apps/frontend/src/features/workflow-builder/settings/NodeSettingsPanel.tsx:794 · packages/graph-workflow/src/auto-wire/resolve-input-port.ts:239

`outputPortsFor` returns `[]` for six of eight node types, so no consumer downstream of a `source`, `map`, `join`, `switch`, `humanGate` or `childWorkflow` can ever reach `auto-bound`. The canvas disagrees with the resolver: `derive-wires.ts` special-cases `source.upload` / `source.api` into the producer index and draws their wires, and `resolve-producer-kind.ts` resolves their kinds — producer-hood is defined twice with different answers, and the code comment defers reconciliation to "Tasks 13–15", which is a plan, not a specification.

The authoring side is the mirror image. `portsForFooter` returns catalog ports for activity nodes but `currentBindings.map(...)` for every control-flow node, and `PortBindingsEditor` renders "None." for an empty list with no add-row control — so a humanGate dropped from the palette has a permanently empty Output-bindings section, and the reviewer's payload falls through to the engine's undocumented fallback key `${node.id}Payload`. The port names an author would need (`approved`, `reviewer`, `comments`, `rejectionReason`, `annotations`, from `ApproveDocumentDto`) appear nowhere in the UI. J5 step 7 — "confirm the corrections a reviewer makes are what gets stored" — cannot be expressed at all.

Third consequence, on the type side: `resolveMapElementKind` only strips `[]` off an activity/pollUntil catalog output, so chaining `map → join → map` or `source → map` yields `undefined` element kind, the `map-item` synthetic producer never fires, and every typed input inside the body resolves `unsatisfied`.

**Proposed disposition:** fix

**Merge note:** **Theme (3 source findings) with one root.** Two passes reached it from opposite ends — A from "where does a reviewer's payload go", C from "which node types can be a producer". The map element-kind consequence (C-012) is separable and could be fixed on its own, but the other two share a single decision: whether control-flow and source nodes get declared output ports.

### G-008 — The ctx-key rename sweep is not exhaustive — library port paths and source-node produced keys are silently split from their consumers, against the drawer's own stated promise

**Found by:** B, D (2 passes) · **Severity:** major · **Type:** impl-gap
**Surfaces:** canvas:source-card, canvas:wire, library-port-editor, save-as-library, settings-panel:source, validation-drawer, widget:field-list, workflow-settings
**Source findings:** B-011, D-013, D-014
**Evidence:** apps/frontend/src/features/workflow-builder/settings/rename-ctx-key.ts:157 · :172 · :147

`renameCtxKeyInConfig` rewrites `config.ctx`, per-node `inputs`/`outputs`, map ctx keys, `join.resultsCtxKey`, childWorkflow input/output mappings and every `ValueRef.ref` inside switch/pollUntil conditions — and the drawer promises in body copy that "renaming a key rewrites every binding that references it". Two categories are missed, so this is an implementation shortfall against a stated contract.
1. **Library port paths.** `config.metadata.inputs[]` / `metadata.outputs[]` hold `LibraryPortDescriptor.path` values, which are ctx keys and are validated as such. On a library-kind workflow a rename dangles them, `walkLibraryPaths` errors, and the anchor lands in the inert workflow-level bucket with no deep link. There is no repair surface: `SaveAsLibraryModal` only ever creates a *fresh* lineage, so an existing library's port paths cannot be edited and the workflow is stuck invalid.
2. **Source-node produced keys.** `source.upload`'s `parameters.ctxKey` and `source.api`'s `parameters.fields[].name` are treated by the validator as declared producers (`collectSourceProducedCtxKeys`), but the rename's `default:` branch rewrites only `inputs`/`outputs`. After a rename the source keeps producing the old key while consumers read the new one; the canvas data wire disappears (the producer index is rebuilt from parameters) while the consumer's port row still reports `bound: true` — satisfied-looking, pointing at nothing.

Both are per-array additions to a function whose header comment states exhaustiveness as its purpose. Two passes found (1) independently.

**Proposed disposition:** fix

### G-009 — There is no way to find a node in a graph, and no way to ask what else reads a value — the only search in the editor searches the palette

**Found by:** A, B (2 passes) · **Severity:** major · **Type:** design-gap
**Surfaces:** canvas, node-picker, page-shell, palette, settings-panel:inputs, topbar, workflow-settings
**Source findings:** A-026, B-005
**Evidence:** apps/frontend/src/features/workflow-builder/palette/ActivityPalette.tsx:109

Nothing in the editor searches `config.nodes`. The only query field is the palette's `Search activities…`; the canvas's navigation aids are xyflow's `<MiniMap pannable zoomable />` and `<Controls>` — spatial, unlabelled and useless for "where is the node that writes `preparedFileData`". There is no outline or tree view, and the topbar shows a bare node/edge count. The environment already implements exactly this affordance one panel over (the palette filters activities, sources, control-flow and dynamic entries live), and `NodePicker` even concedes graphs get large by swapping Select for Autocomplete above 20 nodes — but that is a form control for picking a reference, not a way to navigate the canvas.

The second half is the reverse lookup. `settings-panel:inputs` shows a node's inbound sources (`← <producer label>`) but nothing lists consumers, so "which nodes set `modelId`" / "what else is this setting shared with before I change it" — the specific fear J6 step 6 names — can only be discharged by opening all 16 nodes one at a time. The canvas's derived data wires are a real, under-credited partial answer for values that flow through a bound port, which is why Pass A rated this `major` rather than `blocker`.

**Proposed disposition:** fix

### G-010 — Clicking a validation issue selects a node the drawer cannot make stick, never brings it into view, and for 30 of 32 anchor shapes carries no deep link at all

**Found by:** B, C (2 passes) · **Severity:** major · **Type:** design-gap + impl-gap
**Surfaces:** canvas, canvas:node-badge, page-shell, settings-panel:advanced-bindings, topbar:validation-button, validation-drawer, validation-engine
**Source findings:** B-006, C-060, C-068
**Evidence:** apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx:1205 · apps/frontend/src/features/workflow-builder/validation/ValidationDrawer.tsx:74 · packages/graph-workflow/src/validator/validator.ts:1531

Two independent halves, and both bite on every issue row.
1. **Selection does not hold, and nothing pans.** The page defines `selectNodeSticky` precisely because a bare `setSelectedNodeId` does not survive — its own comment says xyflow reasserts its internal empty selection on the next change event, "the long-standing reason drawer/programmatic selection never focused a node". Yet `<ValidationDrawer onSelectNode={setSelectedNodeId} />` passes exactly that plain setter, while its sibling prop on the same element (`onFixNodeInput`) routes through the fixed helper. Even when selection sticks, nothing moves the viewport: `handleJumpToProducer` is the only caller of `setCenter` / single-node `fitView`, and it is wired to settings-panel producer rows, not to the drawer.
2. **Anchors do not resolve to fields.** `parseInputPortPath` matches exactly `/^nodes\.(.+)\.inputs\.([^.]+)$/`. Every other anchor — `defaultEdge`, `cases[i].edgeId`, `bodyEntryNodeId`, `sourceMapNodeId`, `parameters<suffix>`, `sourceType`, `itemCtxKey`, `outputs.<port>` — names a specific *field* in a specific settings form and still resolves only to "select the node and close". `nodes.<id>.outputs.<port>` is the structural mirror of the one shape that does deep-link and is not matched, so the output half of the port axis has no deep link at all; the user is left to find the raw output binding under "Show advanced".

Net: for most validation errors, on a graph larger than one screen, clicking the issue produces no visible response whatsoever.

**Proposed disposition:** fix

### G-011 — The preview shows the first output only, covers about a third of the registered kinds, and renders a blank card without saying why

**Found by:** B, C (2 passes) · **Severity:** major · **Type:** design-gap + impl-gap
**Surfaces:** canvas:node-card, canvas:port-rows, preview-widget, preview:classification, preview:dispatch, wire-peek
**Source findings:** B-016, C-045, C-046, C-047
**Evidence:** apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx:1269 · apps/frontend/src/features/workflow-builder/preview/PreviewWidget.tsx:203 · apps/frontend/src/features/workflow-builder/preview/render-kind-value.tsx:32

Four holes in one surface, found from two directions.
1. **First output only.** The canvas projects `primaryOutputCtxKey: node.outputs?.[0]?.ctxKey` and hands only that to the overlay; the prop's own doc comment states the limit rather than justifying it. A node with more than one output port — the whole reason `canvas:port-rows` renders one row per port — has every output after the first invisible during a run, with no affordance to switch. The workaround (`wire-peek`) only exists where a data wire was drawn, so an unconsumed second output is unobservable.
2. **Coverage.** Dispatch handles `Document` / `OcrResult` / `Classification` scalars plus `Segment[]`. Of the 27 registered kinds and their array forms that is roughly a third: scalar `Segment<Table>`, `Document[]`, `OcrResult[]`, `PreparedFile[]`, `ValidationResult`, `Reference` and bare `Artifact` all fall through. A generic `preview:json` fallback exists but the dispatcher never reaches for it — only `wire-peek` does.
3. **Silence.** Three of the widget's eight outcomes `return null` with no `data-state`, so "no cache row", "control-flow node" and "this kind has no widget" are the same empty card. A user who ran a node that *did* produce output cannot tell whether the run failed, the cache expired, or the kind simply has no renderer.
4. **Misdispatch.** `LabeledDocumentMap` has `baseKind: Classification`, so family-root dispatch sends a `Record<label, Document[]>` to the label-pill + confidence-bar widget, which type-guards on `{label, confidence}` and will not match — the registry entry itself flags the kind as deliberately schema-free, and family-root dispatch has no escape hatch for a subkind whose shape diverges from its family.

**Proposed disposition:** fix

**Merge note:** **Theme, not a single gap (4 source findings).** They are filed together because they are the same widget and a user hits them as one symptom ("I ran it and I can't see what it produced"), but (1) and (2) are separable pieces of work and (3) is a cheap precondition for triaging either. Note that even a perfect preview widget would not close the OCR-pointer entry, which is a data-model decision one layer down.

### G-012 — "This step didn't run" is one prose string standing in for four different situations — and it is not shown at all during a live Try

**Found by:** B, C (2 passes) · **Severity:** major · **Type:** design-gap + impl-gap
**Surfaces:** canvas:node-card, canvas:wire, preview-widget, run-state, run-status-badge, wire-peek
**Source findings:** B-017, C-044, C-043
**Evidence:** apps/frontend/src/features/workflow-builder/preview/PreviewWidget.tsx:199 · :58 · apps/frontend/src/features/workflow-builder/canvas/WirePeekPopover.tsx:43

`notRunMessage` returns the same sentence for `pending`, `running`, `cancelled` and absent, and its own comment concedes the conflation ("the branch was not taken or the run never reached this node"). The concept has no enum, no named literal and no type — it is a computed copy string emitted under a shared `data-state="not-run"`. `wire-peek` calls the same derived state `no-run`, types `state` as bare `string`, and emits it from two further distinct causes (no active run at all, and a live-Try 404): one derived state, two names, no type, six unconstrained literals.

Worse, the honest copy is gated behind `if (isReplay && runId !== undefined && runId !== "")`; the live-Try branch is a bare `return null` with the comment "stay silent so the canvas isn't cluttered". So in the moment that matters most — watching a Try you just launched take an unexpected branch — a node that was skipped, never reached, or failed before producing output shows an empty card and nothing else. For a switch-heavy workflow "which branch did it take, and why" is *the* debugging question, and the editor answers it only after the fact, and only approximately. No other surface (badge, wire, group chip) expresses the concept at all.

**Proposed disposition:** fix

### G-013 — The map's `collection` binding sits outside the six-state binding model and is never re-resolved once set — deleting its producer quietly makes every body node unsatisfiable

**Found by:** C, D (2 passes) · **Severity:** major · **Type:** design-gap + impl-gap
**Surfaces:** canvas:map-body-box, canvas:port-rows, settings-panel:inputs, settings-panel:map, validation-engine, validation:map-body
**Source findings:** C-026, D-020
**Evidence:** packages/graph-workflow/src/auto-wire/resolver.ts:28 · :29

`collection` is a real bindable port: the resolver honours `lockedInputPorts.includes("collection")` and auto-fills `collectionCtxKey`. It has no `PortDescriptor`, no `kind`, no row in `computePortRows`, no row in `resolveWireableInputRows` and no `PortResolution` — so the entire binding-state axis is missing for the one port that drives every map, and nothing tells the author whether the collection was auto-wired, pinned or disconnected.

The auto-fill is also one-shot: the map pass skips any map whose `collectionCtxKey` is already truthy, so it can never correct itself once the producer is deleted. Nothing in the validator checks that `collectionCtxKey` has a producer (it is not walked by `validatePortBindings` either), and `resolveMapElementKind` then returns `undefined`, which silently removes the map's synthetic `map-item` producer from auto-wire candidacy for every node in the body. The map card shows no problem; the body nodes just quietly become unsatisfiable.

**Proposed disposition:** fix

### G-014 — The path a run actually took is never rendered: in replay no edge is ever highlighted, and some legally auto-wired data wires can never animate at all

**Found by:** A, C (2 passes) · **Severity:** major · **Type:** design-gap + impl-gap
**Surfaces:** canvas:edge-label, canvas:wire, run-state, run:active-edges, wire-peek
**Source findings:** A-034, C-052
**Evidence:** apps/frontend/src/features/workflow-builder/run/active-edges.ts:34 · apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx:2137

`computeActiveEdges` skips any edge whose source is not currently `running`. Every node in a replayed run is terminal, so the returned set is always empty and the canvas shows no taken path — even though the engine does record the chosen branch in `state.selectedEdges`, which nothing exposes on the node-statuses query or anywhere else.

A second, narrower defect in the same machinery: a data wire's liveness is resolved through the normal edge stamped onto it (`wire.edgeId !== undefined && activeEdges.has(wire.edgeId)`), but `upstreamNodesWithDistance` is a multi-hop reverse BFS, so the resolver legitimately auto-binds a consumer to a producer several edges upstream while `deriveStructuralWires` only stamps an `edgeId` when a normal edge joins that exact pair. Such a wire is hard-coded inactive for every run status, and nothing warns the author that a perfectly legal binding is invisible to run animation.

Consequence for J7 step 6 — "which section this page was assigned to, and whether the confidence check sent it to review" — is inferable only by comparing which downstream nodes have a status entry against which are absent, and the preview copy for both cases is the identical sentence.

**Proposed disposition:** fix

### G-015 — An inline child graph is a full `GraphWorkflowConfig` with neither a visual editor nor a validator — every rule the product enforces is dropped one level down

**Found by:** B, C (2 passes) · **Severity:** major · **Type:** design-gap
**Surfaces:** canvas:control-flow-card, page-shell, settings-panel:child-workflow, topbar:validation-button, validation-engine
**Source findings:** B-014, C-009
**Evidence:** apps/frontend/src/features/workflow-builder/settings/control-flow/ChildWorkflowNodeSettings.tsx:266 · packages/graph-workflow/src/validator/validator.ts (no `workflowRef.inline` descent; only a doc comment at :1238)

`workflowRef.type === "inline"` embeds a complete `GraphWorkflowConfig`, and the entire editing surface for it is a JSON `Textarea` bound to a string draft, with the hint "Edit the inline child graph as JSON". Inside that textarea there is no palette, no canvas, no port rows, no auto-wire, no kind checking at the picker level, no preview and no validation-drawer scoping — none of the machinery Parts 3–9 exist to provide, for an artifact of exactly the same type as the outer graph. The component's own header comment concedes it. This is the one place where the visual editor's central premise (graphs are authored visually) is dropped without a stated reason.

Independently, no validator pass descends into `workflowRef.inline.graph`, so edge refs, map/join refs, ctx declarations, reserved namespaces and kind assignability are all unenforced inside it. Repro: paste an inline graph with a dangling `entryNodeId` and a switch whose `defaultEdge` names a missing edge; the validation button stays green and Save succeeds. Inline nesting is a first-class container in the type with no validation contract.

**Proposed disposition:** fix

### G-016 — A `pollUntil` node renders through the control-flow rectangle path and therefore loses every activity affordance — draggable port handles and the unregistered-activity fallback alike

**Found by:** C, D (2 passes) · **Severity:** minor · **Type:** impl-gap
**Surfaces:** canvas:control-flow-card, canvas:node-badge, canvas:port-rows, settings-panel:poll-until
**Source findings:** C-015, D-026
**Evidence:** apps/frontend/src/features/workflow-builder/canvas/port-rows.ts:206 · :114

`rendersPerPortHandle` returns false for anything but `activity` and `estimateNodeHeight` sizes `pollUntil` as a control-flow rectangle, while `computePortRows` and `resolveWireableInputRows` both accept it — so its inputs appear in the settings panel and in the problems badge but can never be dragged to on the canvas. The two surfaces disagree for exactly one node type.

The same rectangle path never consults the activity catalog, so when the wrapped activity type disappears the card looks entirely normal. The contrast is the finding: an `activity` node degrades legibly (`❓` icon, "Unregistered activity.", the raw type string) and a `dyn.*` node gets a dedicated red "Deleted" badge, while a `pollUntil` gets nothing but the validator's node badge. One catalog event, three different treatments.

**Proposed disposition:** fix

### G-017 — humanGate signal names: the palette ships an unvalidated empty default, and three of the four offered presets are names nothing in the product ever sends

**Found by:** A, C (2 passes) · **Severity:** minor · **Type:** design-gap
**Surfaces:** settings-panel:human-gate, validation-engine
**Source findings:** A-023, C-007
**Evidence:** apps/frontend/src/features/workflow-builder/palette/control-flow-skeletons.ts:112 · apps/frontend/src/features/workflow-builder/settings/control-flow/HumanGateNodeSettings.tsx:90

No `signal` path appears anywhere in the validator, and the palette skeleton ships `signal.name: ""` — so a freshly dropped humanGate saves clean and produces `defineSignal("")` at run time: a gate nobody can ever open. If the author does fill it in, `SIGNAL_NAME_PRESETS = ["humanApproval", "approve", "review", "reject"]` offers four choices of which only `humanApproval` is ever emitted anywhere in the repo, so picking `approve` from an autocomplete the product itself offers produces a gate nothing can ever resume. The form's blue Alert does say "the HITL flow sends `humanApproval`", a real improvement on the free-text era — but the wrong choice is one keystroke away and nothing catches it.

**Proposed disposition:** fix

**Merge note:** Both passes filed this `minor`, which may understate it: the failure mode is identical to the blocker filed for the humanGate resume path — a run that blocks until timeout. Worth a second look at the disposition gate.

### G-018 — A re-created or type-swapped node can be served a different activity's cached output for up to 24 h — and every corroborating surface agrees it is correct

**Found by:** D (1 pass) · **Severity:** blocker · **Type:** design-gap + impl-gap
**Surfaces:** cache-evicted-alert, canvas:node-card, node-swap-modal, page-shell, preview-widget, preview:query, run-status-badge, wire-peek
**Source findings:** D-003, D-021, D-036
**Evidence:** apps/temporal/src/cache/cached-activity.ts:220 · apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx:1543 · apps/backend-services/src/cache/activity-output-cache.repository.ts:275

Pass D's notes call this the chain that matters most: three individually defensible decisions composing into the worst outcome in the pass.
1. **The cache key omits `activityType`.** Rows are keyed `(workflowLineageId, node.id, sha256(stableJson(node.parameters)), inputHash)` — the dynamic-node path had to smuggle its versionId *into* `parameters` to get any type identity into the hash at all.
2. **Node ids are reused.** `makeNodeId` scans upward from suffix 1 and returns the first id not currently in `config.nodes`, so deleting `document_split_1` and adding another `document.split` reissues the same id.
3. **Nothing ever evicts.** `deleteExpired()` filters on `expiresAt` alone and is the only delete on the table; `ActivityOutputCache.workflowLineageId` is a bare `String` with no `@relation`, so even deleting a whole workflow leaves its rows live for the full 24 h TTL.

Two reachable collisions follow: swap a node from activity A to activity B where the reconciled parameters are equal — extremely common, because non-overlapping schemas both collapse to `{}` — or delete a node and add a new one of the same type onto the freed id. Both present as a violet "cache hit / skipped" badge and a populated preview: **wrong data shown as correct data**, corroborated rather than exposed by the stale run-status overlay. The manual test plan already concedes there is no UI to force a miss (9.6 instructs `DELETE FROM activity_output_cache`).

**Proposed disposition:** fix

**Merge note:** Pass D asks for a reproduction before this is actioned: it is confident in the key composition but has not watched a collision happen.

### G-019 — A library workflow can be deleted or reshaped under its parents and every parent still validates green — the destructive action is on a different workflow than the one that breaks

**Found by:** D (1 pass) · **Severity:** blocker · **Type:** design-gap
**Surfaces:** library-picker, library-port-editor, preview-widget, run-drawer, settings-panel:child-workflow, validation-engine
**Source findings:** D-032, D-033
**Evidence:** packages/graph-workflow/src/validator/validator.ts:1237 · apps/temporal/src/graph-engine/node-executors.ts:953

`workflowRef.workflowId` lives inside `WorkflowVersion.config` JSON, so there is no foreign key: the P2003 catch in `deleteWorkflow` can never fire for it, and unlike the dynamic-node path (which does a `config::text LIKE` scan before soft-deleting) nothing counts referencing workflows. Cross-workflow library port resolution is explicitly declared out of scope by the validator, so the parent saves with zero problems; the only signal is an orange "Library not found (id may be stale)." line inside the child-workflow settings box, visible only if the author happens to open that node. At run time `get-workflow-graph-config` throws a plain **retryable** Error, so the parent burns its whole retry budget before failing.

The reshape case is the same blind spot without a delete. The library's `metadata.inputs`/`outputs` are fetched and rendered read-only while the mapping rows are free-text `TextInput`s with no cross-check, no drift badge and no re-check on open; the reference is unpinned by default so it follows head; and the executor writes an output mapping only `if (value !== undefined)`, so a mapping naming a port the child no longer emits produces no error anywhere — the ctx key simply never appears, dropping the downstream consumer into the producer-less-key blind spot.

**Proposed disposition:** fix

### G-020 — A humanGate can never be resumed by the product's own review queue — two independent breaks between the HITL module and Temporal, either of which alone is fatal

**Found by:** A (1 pass) · **Severity:** blocker · **Type:** impl-gap
**Surfaces:** run-history-drawer, run-state, run-status-badge, settings-panel:human-gate, source-upload
**Source findings:** A-019, A-020
**Evidence:** apps/backend-services/src/hitl/hitl.service.ts:407 · apps/backend-services/src/workflow/workflow.controller.ts:717

**(A) The review queue sends no signal.** `executeHumanGateNode` flips the document to `awaiting_review` — so it *does* appear in the HITL queue — then blocks on `condition(() => payload !== null, node.timeout)`. The queue's approve action posts `/hitl/sessions/:id/submit` → `approveSession`, which updates the session row, sets the document to `complete`, and never touches Temporal. The only code in the repo that signals `humanApproval` is `TemporalClientService.sendHumanApproval`, whose sole caller is `POST /api/documents/:documentId/approve` — an endpoint the review UI does not call.

**(B) Even calling that endpoint by hand fails.** The source-upload handler creates the Document with `workflow_id: null` / `workflow_execution_id: null`, calls `startGraphWorkflow`, returns `runId` to the browser and never writes it back onto the row. A repo-wide grep for writers of `workflow_execution_id` finds only `null` literals plus reads. `approveDocument` resolves `document.workflow_execution_id || document.workflow_id` and throws `400 "does not have an associated workflow execution ID"` when both are absent — so the correct-by-hand path is closed for any document a builder workflow produced.

Net effect: the gate blocks, the document appears in the queue, a reviewer approves it, the document goes `complete`, and the run sits blocked until the 1 h timeout fires and — with the palette skeleton's default `onTimeout: "fail"` — fails. J5 steps 5 and 7 and the journey's whole "done" definition are unreachable, and the product's headline human-in-the-loop story is broken end to end.

**Proposed disposition:** fix

**Merge note:** Pass A deliberately filed these as two findings because they are independent defects in different modules and fixing either alone leaves the journey broken; its notes ask that the merge treat them as a pair, which is what this entry does.

### G-021 — J1.6 / J2.1 — a workflow can only ever have ONE run in flight: every run start cancels all other running executions of the same lineage

**Found by:** A (1 pass) · **Severity:** blocker · **Type:** design-gap
**Surfaces:** run-drawer, run-history-drawer, run-state, source-upload
**Source findings:** A-001
**Evidence:** apps/backend-services/src/temporal/temporal-client.service.ts:686

`listRunningInLineage` builds the visibility query `WorkflowLineageId = "<id>" AND ExecutionStatus = "Running"` — it has no Try/production discriminator. `cancelInFlightTriesForLineage` cancels every id it returns, and BOTH run entry points call it before starting: `POST /:id/runs` (apps/backend-services/src/workflow/workflow.controller.ts:534) and the source-upload path (:728). So starting document #2 cancels document #1, mid-OCR. J1 step 6 ("run the rest of the folder") and J2 step 1 ("feed the whole batch through in one go") are both unreachable, and J2's "the counts add up to 240 at all times" can never hold. The design intent (test plan 9.7, cancel-on-new-Try) is an editor affordance that was implemented on the shared run API, so it silently governs production traffic too.

**Proposed disposition:** fix

**Merge note:** Pass D examined the same behaviour and did **not** file it — its notes record `D89 (Try cancels the prior in-flight run)` as "defined and implemented". The two passes are not really in conflict: D assessed the editor's Try affordance, A found that the same undiscriminated predicate also governs the production run endpoint. Worth resolving explicitly at the disposition gate.

### G-022 — J1.4 / J7.3 — the preview of an OCR step shows a blob POINTER, not the extracted values; the actual field values are never visible in the builder

**Found by:** A (1 pass) · **Severity:** blocker · **Type:** design-gap
**Surfaces:** preview-widget, preview:dispatch, preview:ocr, wire-peek
**Source findings:** A-003
**Evidence:** packages/graph-workflow/src/types/kind-schemas.ts:22

`OcrResultSchema` is `{documentId, blobPath, storage:"blob", byteLength?, pageCount?, status?}` and its own doc comment says "a blob POINTER to the full OCR payload, not the payload itself". Every OCR/correction activity in the catalog (`azureOcr.extract`, `mistral-ocr.process`, `ocr.cleanup`, `ocr.spellcheck`, `ocr.characterConfusion`, `ocr.normalizeFields`, `ocr.enrich`) declares kind `OcrResult` on both sides, so the whole chain moves pointers. `PreviewWidget` renders `outputCtx` verbatim (no blob dereference exists in `GET /:id/preview-cache`), so `OcrResultPreview`'s K/V table shows `blobPath` / `byteLength` / `status`. Priya's stated acceptance test — "recognising the applicant's name off the page" — is not achievable, and Dana's whole J7 bisection-by-intermediate-value method collapses at the same point. Note also that the `OcrFields` kind exists in the registry but no catalog activity produces it.

**Proposed disposition:** fix

### G-023 — J2.2 — there is no batch: no grouping of runs, no aggregate done/running/failed counts, no unit above a single run

**Found by:** A (1 pass) · **Severity:** blocker · **Type:** design-gap
**Surfaces:** run-history-drawer, run-history-filters, run-history:query, run-row
**Source findings:** A-006
**Evidence:** apps/frontend/src/features/workflow-builder/run-history/RunHistoryFilters.tsx:43

`run-history-drawer` is a flat cursor-paged list of individual executions filtered by status / date range / version only. There is no batch entity in the schema, no correlation id on a run, and no count roll-up anywhere. Marcus's step 2 ("how many are done, how many still going, how many failed — the counts add up to 240") has no surface to read. Even the degenerate workaround (filter by date range and count rows by eye) can't distinguish this quarter's batch from a re-run of one file.

**Proposed disposition:** fix → **APPROVED: defer**
**Approval note (2026-07-25):** Deferred to the batch epic. There is no batch concept to fix — this is a feature to build, and it belongs with G-025 and G-006 in their own plan.

### G-024 — J7.3/J7.4 — yesterday's run has no values left to walk: the preview cache TTL is 24 h, and the offered recovery starts a brand-new run against head

**Found by:** A (1 pass) · **Severity:** blocker · **Type:** design-gap
**Surfaces:** cache-evicted-alert, preview-widget, preview:query, wire-peek
**Source findings:** A-032
**Evidence:** packages/graph-workflow/src/cache/constants.ts:11

`DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000` and the GC sweep deletes expired rows. J7's premise — "The run happened yesterday" — puts every intermediate value at or past expiry, so replaying it yields `cache-evicted-alert` on node after node. The alert's only remedy is a Re-run button which POSTs `{initialCtx}` with no `workflowVersionId` (apps/frontend/src/features/workflow-builder/preview/CacheEvictedAlert.tsx:143), i.e. against the CURRENT head config — compounding A-027 — and, per A-001, cancelling anything else running on that lineage. It also violates J7 step 8's stated constraint ("without … creating a second official result for it"): the re-run is an ordinary run and appears in run history as one.

**Proposed disposition:** fix

### G-025 — J1.2 / J2.1 — file intake is strictly one file per upload; there is no multi-file or folder affordance anywhere

**Found by:** A (1 pass) · **Severity:** blocker · **Type:** design-gap
**Surfaces:** run-drawer, settings-panel:source, source-upload
**Source findings:** A-002
**Evidence:** apps/frontend/src/features/workflow-builder/run/RunWorkflowDrawer.tsx:557

The Run-drawer Dropzone is `multiple={false}`; the settings-panel "Upload & Try" button posts one file (apps/frontend/src/features/workflow-builder/sources/useSourceUpload.ts:7 — "a single part named `file`") and the endpoint is a single-file `FileInterceptor`. Priya's folder of 60 and Marcus's batch of 240 have to be uploaded one at a time, and A-001 means each upload kills the previous one. Even the honest workaround (write a script that loops the upload endpoint) is defeated by A-001.

**Proposed disposition:** fix → **APPROVED: defer**
**Approval note (2026-07-25):** Deferred to the batch epic. Multi-file intake is a new capability rather than a repair; sequencing it with G-023 avoids building the affordance twice.

### G-026 — J4.7 — one bad page kills the whole document: the map fan-out awaits `Promise.all`, not `allSettled`, and no per-node skip policy is authorable

**Found by:** A (1 pass) · **Severity:** blocker · **Type:** impl-gap
**Surfaces:** run-status-badge, settings-panel, settings-panel:map
**Source findings:** A-018
**Evidence:** apps/temporal/src/graph-engine/runner-utils.ts:48

`executeWithConcurrencyLimit` does `await Promise.race(executing)` inside the loop and `await Promise.all(executing)` at the end, so the first rejecting iteration rejects the map and fails the run. Marcus states the opposite requirement: "he wants the other 299 pages, with the bad page identified — not a lost document." The engine's own per-node `errorPolicy.onError: "skip"` would express it, but per A-010 there is no way to set it, and even set it would not change the map's all-or-nothing await. `JoinNode.strategy` is fixed to `"all"` (types.ts:242) so there is no partial-collect escape either.

**Proposed disposition:** fix

### G-027 — No unsaved-changes guard: a reload or a stray back-navigation discards the entire editing session

**Found by:** B (1 pass) · **Severity:** blocker · **Type:** design-gap
**Surfaces:** canvas, page-shell, topbar
**Source findings:** B-019
**Evidence:** Repro: open /workflows/<id>/edit, add three nodes from the palette, wire them, edit parameters — do not click Save — then press the browser Back button or F5. All edits are gone with no prompt. Verification: `rg -rn 'beforeunload' apps/frontend/src` returns nothing (no window listener anywhere in the frontend), and there is no react-router blocker/usePrompt in the feature — `rg -ni 'beforeunload|unsaved|isDirty|blocker|usePrompt' apps/frontend/src/features/workflow-builder/ -g '!*.test.*'` returns only three prose comments (WorkflowEditorV2Page.tsx:505, :507, :874), none of which installs a guard. Config lives solely in React state (setConfig in WorkflowEditorV2Page.tsx) with no draft persisted to localStorage or the server.

The page KNOWS when it is dirty — the hydration effect compares `configRef.current !== lastHydratedConfigRef.current` to decide whether a server refetch may safely stomp local edits (`WorkflowEditorV2Page.tsx:513`–`:518`), and the comment at `:505` names the risk explicitly ('would stomp the user's unsaved canvas edits'). That same dirty bit is never used to protect the user from themselves. There is no autosave, no draft, no beforeunload, no router block. Combined with B-001 (no undo) this means the editor has no durability story of any kind between saves: an accidental navigation is indistinguishable from an accidental delete, and both are unrecoverable. Blocker because the cost is unbounded — an entire authoring session — and the detection logic already exists.

**Proposed disposition:** fix

### G-028 — Authored work cannot be reproduced or moved: no duplicate, no copy/paste, no export/import, no duplicate-workflow — every new node is blank

**Found by:** B (1 pass) · **Severity:** major · **Type:** design-gap
**Surfaces:** canvas, hover-extend, node-menu, page-shell, palette, save-as-library, templates-modal, topbar:more-menu
**Source findings:** B-003, B-004
**Evidence:** apps/frontend/src/features/workflow-builder/canvas/NodeContextMenu.tsx:15 · apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx:1090

Every node-creation path produces a **blank** node — `addActivity` / `addDynamicNode` materialise schema defaults only, and `hover-extend` calls the same skeleton builders — and the node context menu offers exactly three entries (Change activity type / Edit script / Delete node). So the only way to get a second `document.validateFields` carrying the same eight hand-authored rules, or a second `ocr.characterConfusion` with the same confusion map, is to re-enter the entire rich-widget payload by hand. This is the most common authoring action in every comparable graph editor, and its cost scales with how much parameter surface an activity has — which for this catalog's rich widgets is a lot.

Cross-workflow transfer has no substitute either: no clipboard code exists anywhere in the feature, the More menu has no Export/Import/Duplicate-workflow, the list page has Open/Run/Delete only, and there is no JSON download. The two adjacent affordances are not substitutes — "Save as library" serialises the *entire* config and yields a by-reference childWorkflow, not pasteable nodes, and templates only seed a brand-new workflow. Net: a three-node OCR-cleanup chain perfected in workflow A can only reach workflow B by being rebuilt from the palette, node by node, parameter by parameter.


**VERIFIED 2026-07-27: still true.** No duplicate, copy/paste or export affordance exists in the feature.

**Proposed disposition:** fix

### G-029 — Edge-id references held by control-flow nodes are never swept on delete, and humanGate's fallback edge is not even validated

**Found by:** D (1 pass) · **Severity:** major · **Type:** design-gap + impl-gap
**Surfaces:** canvas:control-flow-card, canvas:edge-label, canvas:wire, edge-picker, settings-panel:human-gate, settings-panel:switch, validation-drawer, validation-engine
**Source findings:** D-008, D-009
**Evidence:** packages/graph-workflow/src/validator/validator.ts:905 · apps/frontend/src/features/workflow-builder/graph-widgets/EdgePicker.tsx:104

No delete path prunes `SwitchCase.edgeId`, `SwitchNode.defaultEdge` or `HumanGateNode.fallbackEdgeId`. The switch pair is at least caught reactively — the validator flags all three anchors and `EdgePicker` computes a `staleReference` warning — but the author gets no signal at the moment of deletion, and the asymmetry is the finding: an edge that no case names any more degrades *visibly* to an `(unmatched)` label on the canvas, while a case that names a deleted edge produces nothing visible at all. Same event, one direction legible, the other silent.

`HumanGateNode.fallbackEdgeId` is strictly worse: the only `fallbackEdgeId` checks in the validator are scoped to `node.errorPolicy`, and the humanGate branch validates the timeout duration only. A gate with `onTimeout: "fallback"` whose edge was deleted therefore saves clean and detonates at execution, with the EdgePicker's stale warning visible only if the author happens to open that node.

**Proposed disposition:** fix

**RULING (2026-07-27): fix — SHIPPED `11b627c3`.** `pruneEdgeReferences` sweeps all four edge-id fields (`switch.cases[].edgeId`, `switch.defaultEdge`, `humanGate.fallbackEdgeId`, `errorPolicy.fallbackEdgeId`) on every one of the three edge-removal paths. A `fallback` mode whose edge disappears is downgraded to `fail` — behaviour-preserving, since both fallback executors already threw a non-retryable `GRAPH_EXECUTION_ERROR` when the edge was missing. A dangling `switch.defaultEdge` is cleared, never replaced: which branch becomes the default is the author's call, and the validator already asks for one.

### G-030 — Exposed parameters have no reference integrity and are destroyed silently by the mutation paths that touch them most — while the least destructive path is the only one that warns

**Found by:** D (1 pass) · **Severity:** major · **Type:** design-gap + impl-gap
**Surfaces:** canvas, canvas:group-chip, exposed-params-editor, node-menu, settings-panel, settings-panel:group, topbar:more-menu, validation-drawer
**Source findings:** D-022, D-028, D-029, D-030
**Evidence:** packages/graph-workflow/src/validator/validator.ts:1136 · apps/frontend/src/features/workflow-builder/settings/group/GroupNodeSettings.tsx:203 · :146 · apps/frontend/src/features/workflow-builder/group/create-group.ts:114

**Integrity.** `ExposedParam.path` is validated only as far as `parts[1]`, the node id; `parts[3]`, the parameter key, is never compared with the node's `parameters` or the catalog schema, and the field is bare free text with no picker. A catalog parameter rename, or a swap that drops a key, leaves the exposed param pointing at nothing with no signal anywhere.

**Silent loss.** `pruneNodeFromGroups` returns only a config; the dropped count is reconstructed *by the caller*, so only `GroupNodeSettings.removeNodeId` can raise the "Exposed parameter dropped" toast that test-plan 6.4 asserts. The other two callers — `deleteSelected` and the canvas `removeNodesFromConfig` — have no mechanism to surface it, and the canvas keyboard path deletes many nodes at once, so one keypress can silently destroy a whole group and all its exposed params. The test plan makes this look covered; it is covered only on the least destructive path.

**Inverted guard.** "Delete group" is a two-line object delete: member nodes survive (correct and documented) but `exposedParams` live only on the group object and vanish with it — no count, no toast, no confirm. Yet removing the *last member*, the smaller act, does pop a `window.confirm`, because that path deletes the group implicitly.

**Dangling-but-valid.** `createGroupFromSelection` enforces single membership by stripping the incoming ids from every other group and dropping any group thereby emptied, taking its exposed params unannounced; the *surviving* shrunken group has its `nodeIds` rewritten and its `exposedParams` left untouched, so an entry can keep naming a node that now belongs to a different group. Because the node still exists, the save-time "references non-existent node" check never fires and `ExposedParamsEditor`'s membership-based stale badge is the only thing that can catch it.

**Proposed disposition:** fix

**Merge note:** **Theme, not a single gap (4 source findings).** One decision is "who owns exposedParam integrity"; a second, smaller one is "make all three delete paths report what they dropped".

### G-031 — Three canvas element types render no validation state at all, so the top bar can read "N issues" with nothing marked anywhere on the graph

**Found by:** C (1 pass) · **Severity:** major · **Type:** design-gap
**Surfaces:** canvas:edge-label, canvas:group-chip, canvas:node-badge, canvas:source-card, canvas:wire, topbar:more-menu, validation-drawer
**Source findings:** C-062, C-063, C-070
**Evidence:** apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx:1991 · :1983 · apps/frontend/src/features/workflow-builder/canvas/WorkflowEdge.tsx:222

The badge-sync effect explicitly skips `source` nodes ("no `errorCount`/`warningCount` fields on `SourceNodeData`") and `group-chip` nodes ("a pure visual collapse"), and edges never consult the validation result at all — they take colour from their `type` and their label from `edge-labels.ts`. Each exclusion has a stated reason and each is now an open cell.

Source nodes carry ERROR-severity rules (`nodes.<sourceId>.sourceType`, `nodes.<sourceId>.parameters<suffix>`) that appear in the drawer and in the top-bar count with no corner badge on the card. Group chips DO mount `GroupAggregateStatusBadgeOverlay` for run status, so the aggregate-to-chip rule exists for one axis and not the other — collapsing a group in simplified view removes every member's problems badge from the canvas while the count keeps rising. And five anchor shapes name an edge (`edges[i]`, `.source`, `.target`, `edges.<edgeId>`, `edges.<edgeId>.source`); all five are invisible on the canvas and inert in the drawer. Either the data shapes gain the missing fields or the scoped-out decisions need restating now that these elements carry error-severity rules.


**VERIFIED 2026-07-27: still true.** The badge-sync effect still returns early for `group-chip`, `map-body-container` and `source` nodes, each with its stated reason.

**Proposed disposition:** fix

**RULING (2026-07-27): fix — SHIPPED `affb5cd9`.** Source cards and group chips only. Both stale early-returns are gone: source cards mount the shared badge with the same deep-link callback, and chips roll up their members' counts (they already aggregated run status; validation was the missing axis). `ValidationBadge` moved to its own module to make that possible.

**The five edge anchor shapes are NOT fixed and stay open.** Marking an edge needs a visual language for "this connection has a problem" that the canvas does not have, and inventing one is a design decision rather than a fix. The anchors are navigable from the drawer today (G-010); they are just not marked in place.

### G-032 — An activity-type swap carries bindings, output rows and lock metadata the new type does not declare — and nothing ever checks that a bound port exists in the catalog

**Found by:** D (1 pass) · **Severity:** major · **Type:** design-gap + impl-gap
**Surfaces:** canvas:port-rows, canvas:wire, node-swap-modal, preview-widget, settings-panel:advanced-bindings, settings-panel:inputs, wire-menu
**Source findings:** D-005, D-006, D-007
**Evidence:** apps/temporal/src/graph-engine/node-executors.ts:415 · packages/graph-workflow/src/validator/validator.ts:1258 · packages/graph-workflow/src/auto-wire/strip-redundant-locks.ts:66

The carry-over itself is specified — the guide says the swap "keeps the label, ports, error/retry/timeout policy". What was never specified is what happens when the new type does not declare the carried ports, and three things go wrong.
1. **The engine writes `undefined` through stale output rows.** `swapActivityType` returns `outputs: node.outputs` unchanged while `activityType` changes; the engine then writes `result[binding.port]` for every persisted row, silently overwriting the ctx key downstream consumers read. The canvas keeps drawing the wire, because `buildProducerIndex` indexes `producerNode.outputs` directly and only *decorates* with the catalog — so the graph still looks correctly wired.
2. **Port membership is never tested.** There is no port-name membership check anywhere in the validator; `resolvePortKind` falls through to the ctx-declared kind and then to `undefined` on a miss, which makes `isAssignable` pass vacuously — so an orphan binding also disables the type check on that ctx key. No UI can see or delete it either: `computePortRows` and `portsForFooter` both enumerate the catalog, not the bindings, while `deriveDataWires` still emits a wire for it.
3. **Locks ride along.** `metadata.lockedInputPorts`/`lockedOutputPorts` survive the schema change; `stripRedundantLocks` deliberately keeps a lock whose port has no binding ("preserve explicit intent") and `normaliseLocks` re-infers on load, so the stale entry is durable and invisible — until the new type later gains a port with that name, at which point the resolver refuses to auto-wire it and reports `locked-unbound` with no explanation the author can act on.

All three are also reachable by a catalog port rename between releases, for which there is no migration mechanism.


**VERIFIED 2026-07-27: still true.** `swapActivityType` returns `inputs`, `outputs` and `metadata` verbatim, and no port-name membership check exists in the validator.

**Proposed disposition:** fix

**RULING (2026-07-27): fix — SHIPPED `e188f58c`.** Bindings now follow the same intersection rule the parameters already did — a binding survives only when the new type declares its port — and lock metadata is pruned the same way. Confirmed the corruption first: `writeToCtx` ends `current[finalKey] = value` with no undefined guard, so a stale output row wrote `undefined` over the ctx key downstream steps read. Dropped bindings are returned and named by the caller rather than pruned silently.

**Merge note:** Pass D deliberately typed (2) as a `design-gap` (the carry-over is specified; what happens when the new type lacks the ports is not) and (1)/(3) as `impl-gap`s (unambiguous misbehaviour). Filed as one entry because a port-membership check is the common precondition for repairing any of them.

### G-033 — The graph cannot be authored without a mouse — zero focusable authoring affordances in the whole feature

**Found by:** B (1 pass) · **Severity:** major · **Type:** impl-gap
**Surfaces:** canvas, canvas:port-rows, hover-extend, node-menu, palette, wire-menu
**Source findings:** B-024
**Evidence:** apps/frontend/src/features/workflow-builder/palette/ActivityPalette.tsx:334

`rg -n 'tabIndex' ` and `rg -n 'role="'` over `apps/frontend/src/features/workflow-builder/` (excluding tests) each return ZERO hits. Every palette row — the only way to create a node — is a Mantine `<Group>` (a plain div) carrying `onClick` + `draggable` and nothing else: activity rows at the cited line (`onClick` `:337`, `draggable` `:338`), dynamic rows `:441`, source rows `:528`, control-flow rows `:590`. Not focusable, no `role`, no key handler: a keyboard user cannot add a single node. The other authoring gestures are equally mouse-bound — port drag-to-bind via `<Handle>` plus `onMouseEnter`/`onMouseLeave` (`canvas/PortRows.tsx:202`, `:212`, `:221`), `hover-extend` driven purely by hover (`canvas/use-hover-extend.ts`), and both context menus opened from `onNodeContextMenu` / `onEdgeContextMenu` (`canvas/WorkflowEditorCanvas.tsx:3065`–`:3066`). What DOES work comes free from xyflow defaults, not from this code: nodes are focusable and arrow-movable (`disableKeyboardA11y = false`) and Delete/Backspace deletes (`:3079`) — i.e. the one keyboard-reachable operation in the editor is the destructive one. Mantine drawers and forms are natively keyboard-usable, so the gap is specifically the canvas + palette authoring loop.


**VERIFIED 2026-07-27: still true, exactly as measured.** `tabIndex` and `role="` each still return **zero** non-test hits across the whole feature directory.

**Proposed disposition:** fix

### G-034 — J3.3/J3.5 — per-section branching forces a map+join shape, and a branch that dead-ends inside the map body silently drops that section's result with only a yellow warning

**Found by:** A (1 pass) · **Severity:** major · **Type:** design-gap
**Surfaces:** canvas:map-body-box, settings-panel:join, settings-panel:map, validation-drawer, validation:map-body
**Source findings:** A-014
**Evidence:** packages/graph-workflow/src/validator/validator.ts:602

A join's `sourceMapNodeId` must resolve to a node whose type is `map` (validated at :602/:610), so "reassemble the per-section results" is only expressible as switch-inside-a-map-body. The product's own showcase demo ships two of three branches dead-ending short of the body exit (MANUAL_TEST_PLAN.md 4.15 documents this as intentional), and the only signal is a *warning* from `map-body-validation.ts:38` — Save still succeeds and the run still completes, minus those sections. Marcus's step 4 requirement ("he does not want an unrecognised page silently dropped") is exactly the state the product tolerates with a yellow badge.


**VERIFIED 2026-07-27: still true.** `map-body-validation.ts` still emits `severity: "warning"` for both dead-end cases, so Save still succeeds.

**Proposed disposition:** fix

### G-035 — No extract-to-sub-workflow and no inline-a-sub-workflow — the two refactors that make composition usable

**Found by:** B (1 pass) · **Severity:** major · **Type:** design-gap
**Surfaces:** canvas, save-as-library, settings-panel:child-workflow, settings-panel:group, topbar:more-menu
**Source findings:** B-015
**Evidence:** apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx:816

The system supports composition (childWorkflow nodes, library workflows, `LibraryPickerModal`) but offers no refactor into or out of it. Extract: 'Save as library' takes the WHOLE config — `const persisted = stripRedundantLocks(config)` (cited line), never a selection — so a user who has built a reusable 4-node cleanup chain inside a larger workflow cannot promote just that chain; there is no 'Extract selection to sub-workflow' on the More menu (`:1090`–`:1184`), the node context menu (`canvas/NodeContextMenu.tsx:15`) or the group panel, even though `selectedNodeIds` and `NodeGroup` already give the selection and the boundary. Inline: nothing expands a childWorkflow back into its parent — `rg -ni 'extract to|extract selection|inline the|expand inline'` over the feature returns nothing. Both directions are the standard escape hatches when a decomposition turns out wrong; without them, the choice of where a boundary sits is made once and permanently.


**VERIFIED 2026-07-27: still true.** A case-insensitive search for extract/inline refactor affordances returns zero hits.

**Proposed disposition:** fix

### G-036 — Scope between a join and its source map is never checked, and the source-map picker actively offers the configurations that throw at run time

**Found by:** C (1 pass) · **Severity:** major · **Type:** design-gap
**Surfaces:** node-picker, settings-panel:join, settings-panel:map, validation-drawer, validation-engine
**Source findings:** C-003, C-004, C-005
**Evidence:** apps/temporal/src/graph-engine/node-executors.ts:989 · packages/graph-workflow/src/validator/validator.ts:571 · apps/frontend/src/features/workflow-builder/settings/control-flow/JoinNodeSettings.tsx:106

`validateMapJoinNodes` checks only that `sourceMapNodeId` exists and has type `map`. Two reachable failures follow. (1) `executeBranchSubgraph` allocates `mapBranchResults: new Map()` per iteration, so an inner map's results are discarded when the iteration ends — a join outside the outer body pointed at an inner map throws `No results found for map node <id>`. (2) A map behind a switch case that is not taken still leaves its join ready, because the join's own incoming edge is satisfied, and it throws the same way. Nothing static rejects either configuration.

The picker makes both likely rather than exotic: `filterType="map"` is its only filter, so maps inside another map's body, inside an unreached switch branch, or downstream of the join itself are all offered with no dimming and no warning.


**VERIFIED 2026-07-27: still true.** `validateMapJoinNodes` checks existence and type only; `JoinNodeSettings` still passes `filterType="map"` as its sole filter.

**Proposed disposition:** fix

**RULING (2026-07-27): fix — SHIPPED `9de30797`.** `validateJoinScope` refuses a join whose source map runs inside a body the join is outside of (results discarded per iteration) and a join inside its own source's body (the loop has not finished). The picker reads `joinableMapIds` — the same helper — so the editor cannot offer a choice Save would refuse. The switch-branch-not-taken half of the entry is NOT covered: that is a reachability question, not a scope one.

### G-037 — Palette control-flow skeletons ship required fields as empty strings that no validator rule ever checks, so an unconfigured node saves clean and fails at execution

**Found by:** C (1 pass) · **Severity:** major · **Type:** design-gap
**Surfaces:** canvas:node-badge, settings-panel:child-workflow, settings-panel:join, settings-panel:map, validation-engine
**Source findings:** C-010, C-011
**Evidence:** apps/frontend/src/features/workflow-builder/palette/control-flow-skeletons.ts:65 · :88

`map.collectionCtxKey`, `map.itemCtxKey`, `join.resultsCtxKey` and `childWorkflow.workflowRef.workflowId` all ship as `""`. The validator has existence checks for the *node-id* fields in the same objects (`bodyEntryNodeId`, `bodyExitNodeId`, `sourceMapNodeId`, `switch.defaultEdge`, `pollUntil.activityType`) and no rule at all for these four; `itemCtxKey` gets only a reserved-namespace check. `computeNodeInputIssues` short-circuits for every non-activity/pollUntil node, so a half-configured map, join or childWorkflow carries no badge and no drawer row while its neighbours do — the graph looks clean and detonates at run time.


**VERIFIED 2026-07-27: still true.** The skeletons still ship `collectionCtxKey: ""`, `itemCtxKey: ""`, `resultsCtxKey: ""` and `workflowId: ""`, and the validator has no rule referencing `collectionCtxKey` or `resultsCtxKey` at all.

**Proposed disposition:** fix

**RULING (2026-07-27): fix — SHIPPED `df343e19`.** Four new validator ERRORS for the fields the palette ships as `""` (`map.collectionCtxKey`, `map.itemCtxKey`, `join.resultsCtxKey`, library `childWorkflow.workflowId`). Errors rather than warnings: unlike an absent `maxConcurrency`, an empty collection key cannot run under any circumstances. Verified against all 15 shipped templates first — 2 maps, 1 join, 4 childWorkflows, none empty — so the rules bite only on palette-created nodes.

**Merge note:** `humanGate.signal.name` is the fifth field in this family; it is filed separately because its failure mode (a gate nothing can open) is different in kind.

### G-038 — Every workflow-level validation row is inert — including nine anchors that name a concrete edge, group, ctx key or parameter path with a real editing surface

**Found by:** C (1 pass) · **Severity:** major · **Type:** design-gap + impl-gap
**Surfaces:** canvas:wire, exposed-params-editor, settings-panel:group, validation-drawer, workflow-settings
**Source findings:** C-061, C-064, C-065
**Evidence:** apps/frontend/src/features/workflow-builder/validation/ValidationDrawer.tsx:202 · apps/frontend/src/features/workflow-builder/validation/useGraphValidation.ts:116 · packages/graph-workflow/src/validator/validator.ts:523

The workflow-level bucket passes `onClick={undefined}` unconditionally. `edges.<edgeId>.source`, `nodeGroups.<id>.nodeIds[i]`, `nodeGroups.<id>.exposedParams[i].path`, `entryNodeId`, `ctx.<key>` and `metadata.inputs[i].path` all identify a single artifact with a real editing surface, and all six are completely inert — not even "Select node →". Nine of the 32 anchor shapes land there.

Two of those buckets are *misrouted* rather than genuinely workflow-level. `nodeIdFromPath` requires the literal `nodes.` prefix, so group anchors fall through even though `settings-panel:group` is their editing surface and the first of them names a node id outright. And `ctx.<key>` / `metadata.ctx` point at rows the `WorkflowSettingsDrawer` ctx table renders and edits. Because two of the four anchor shapes that can carry `warning` severity land in this bucket, warnings are disproportionately unactionable.


**VERIFIED 2026-07-27: ALREADY FIXED by G-010.** `resolveAnchorTarget` routes edge, group, `entryNodeId`, `ctx.*` and library-port anchors; the workflow-level bucket passes a real `onClick` for all of them. Only the genuinely workflow-level anchors stay inert, which is correct.

**Proposed disposition:** fix

### G-039 — Entry-node reassignment on delete picks an arbitrary survivor, unannounced, and usually produces an immediately invalid graph

**Found by:** D (1 pass) · **Severity:** major · **Type:** design-gap
**Surfaces:** page-shell, settings-panel, topbar:validation-button, validation-drawer, workflow-settings
**Source findings:** D-010
**Evidence:** apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx:740

D3. Both delete implementations do `Object.keys(nodes)[0] ?? ""` (also canvas/WorkflowEditorCanvas.tsx:1683). Insertion order carries no topological meaning, and the validator forbids an entry node with incoming edges (validator.ts:277), so the auto-picked node is frequently invalid the instant it is chosen. There is no notification — the only signal is a workflow-level row in the validation drawer, which does not light the node badge because the anchor `entryNodeId` does not start with `nodes.`. Deleting the last node yields `entryNodeId: ""` and a hard 'entryNodeId is required' error.


**VERIFIED 2026-07-27: still true.** `remove-nodes.ts` re-seats `entryNodeId` onto `Object.keys(nodesCopy)[0]` — an arbitrary survivor — and neither `describeOrphanedDelete` nor the delete toast mentions `entryNodeId` at all. The reassignment happens; it is never announced.

**Proposed disposition:** fix

**RULING (2026-07-27): fix — SHIPPED `117a6801`.** Two fixes. `resolveNextEntryNodeId` prefers a surviving source node, then a node with no inbound edges, instead of `Object.keys()[0]` — which is insertion order and usually promoted a node that cannot be an entry point. And the promotion is now announced, on its own when nothing is orphaned and appended to the orphan message otherwise. The toast reads the promoted id from the same function the delete uses, so the two cannot drift.

**Merge note:** Pass B independently noted the arbitrary `entryNodeId` reassignment as part of node-delete's blast radius (in B-002, merged into the undo/guards entry above), but did not file it separately — so this is corroborated in substance without being a second source finding.

### G-040 — Renaming or removing a `source.api` field row silently orphans every consumer bound to it

**Found by:** D (1 pass) · **Severity:** major · **Type:** design-gap
**Surfaces:** canvas:source-card, canvas:wire, run-drawer, settings-panel:source, widget:field-list
**Source findings:** D-027
**Evidence:** apps/frontend/src/features/workflow-builder/sources/FieldListEditor.tsx:185

D31/D30. The editor rewrites the whole `fields[]` array with no cascade to consumer bindings and no dialogue listing what depends on the row. The field is simultaneously a ctx producer and a run-spec input property (`deriveOutputSchema` → `buildRunSpec`), so one edit changes both the internal wiring and the external contract. Consumers get an undeclared-ctx-key error only if `config.ctx` is non-empty (validator.ts:663 early-returns otherwise), the auto-wire warning is suppressed because the port *is* explicitly bound (auto-wire-validation.ts:34), and the canvas drops the wire while the port row still reports `bound: true`. A rename is strictly worse than a removal: it produces an orphan binding and an unconsumed producer with nothing linking the two.

**Proposed disposition:** fix

**RULING (2026-07-27): fix — SHIPPED `11f18c2b`.** Renaming a field now drives `renameCtxKeyInConfig` — the same sweep G-008 already runs in the other direction, so the two stay symmetric. The name commits on blur rather than per keystroke, which is load-bearing: a ctx-key rename per character would sweep the graph once per character. A rename is only inferred from a same-length positional diff, because a shifted row is indistinguishable from a renamed one by position alone.

**Merge note:** The mirror of the ctx-rename sweep entry: the same producer/consumer split reached from the source-field editor instead of the ctx table. Also changes the external run-spec contract, as does the `isInput` retype entry.

### G-041 — J1.3 — a first-timer landing on an empty canvas gets 41 ungrouped activities and no reachable starting recipe; the template picker lives only on the list page

**Found by:** A (1 pass) · **Severity:** major · **Type:** design-gap
**Surfaces:** page-shell, palette, templates-modal, topbar:more-menu
**Source findings:** A-004
**Evidence:** apps/frontend/src/pages/WorkflowListPage.tsx:310

`TemplatesPickerModal` is mounted only by `WorkflowListPage`; nothing in the editor (`topbar:more-menu` included) can reach it. Once on `/workflows/create` the only guidance is the palette's "Search activities…" box over 41 entries in 12 categories. Priya's step 3 assumption — "the tool already knows how to read a document, I am choosing from what it can do" — requires her to guess that a document read is `file.prepare` → `azureOcr.submit` → (`pollUntil` on `azureOcr.poll`) → `azureOcr.extract`. `hover-extend` partly rescues this by offering kind-compatible next nodes off a source handle, but it only fires on hover of a handle she has no reason to hover, and the wildcard `Artifact` output ports of `azureOcr.submit` make its suggestion list unfiltered.


**VERIFIED 2026-07-27: still true.** `TemplatesPickerModal` is still mounted only by `WorkflowListPage`.

**Proposed disposition:** fix

### G-042 — J2.3 — nothing distinguishes "slow" from "wedged": a run shows `running` with a start time and no deadline, heartbeat, or last-progress signal

**Found by:** A (1 pass) · **Severity:** major · **Type:** design-gap
**Surfaces:** run-history-drawer, run-row, run-status-badge, run:polling
**Source findings:** A-007
**Evidence:** apps/frontend/src/features/workflow-builder/run/node-status.types.ts:47

`NodeRunStatus` carries `startedAt` / `endedAt` / `errorMessage` / `cacheHit` — no attempt count, no deadline, no heartbeat. `RunRow` shows a status dot and a relative start time. Neither surface exposes the activity's effective `startToClose` timeout (defaulted to `"2m"` in the engine at apps/temporal/src/graph-engine/node-executors.ts:313) or its retry budget, so "is this still working or is it stuck" is unanswerable without the Temporal UI. This is the exact failure Marcus says burned him before, and it is the step of J2 that a batch surface (A-006) alone would not fix.


**VERIFIED 2026-07-27: still true.** `NodeRunStatus` carries no attempt count, deadline or heartbeat field.

**Proposed disposition:** fix

### G-043 — J2.4 — a failure reason is a hover tooltip on one node badge of one open run; it is not attached to the document and does not survive a reload

**Found by:** A (1 pass) · **Severity:** major · **Type:** design-gap
**Surfaces:** run-history-drawer, run-row, run-status-badge, validation-drawer
**Source findings:** A-008
**Evidence:** apps/frontend/src/features/workflow-builder/run/NodeStatusBadge.tsx:118

`errorMessage` reaches the frontend on the node-statuses wire but is rendered only as a Mantine `<Tooltip label={errorMessage}>` on the failed node's canvas badge — not selectable, not copyable, not listed, and gone as soon as `activeRunId` is cleared (a page reload clears it). `run-row` shows only a red dot. To read the reason for one of Marcus's 240 files he must replay that specific run, find the failed node, and hover it. Distinguishing "password-protected" from "service rejected the content" from "not a readable PDF" — his stated routing requirement — is possible only if the underlying activity happens to phrase the message that way, and there is no place that message is retained.


**VERIFIED 2026-07-27: still true.** `errorMessage` is read only by `NodeStatusBadge`, and only inside the `status === "failed"` tooltip branch.

**Proposed disposition:** fix

### G-044 — J7.1 — a run cannot be found by its document: run history filters on status, date range and version only

**Found by:** A (1 pass) · **Severity:** major · **Type:** design-gap
**Surfaces:** run-history-drawer, run-history-filters, run-history:query, run-row
**Source findings:** A-031
**Evidence:** apps/frontend/src/features/workflow-builder/run-history/RunHistoryFilters.tsx:43

`STATUS_OPTIONS` plus From/To `DateInput`s plus a version Select is the whole filter row; `ListRunsFilters` has no free-text or ctx-value predicate. The only per-run identifier on screen is `run-row`'s `inputCtxSummary` chip, which truncates to the first two keys — for an upload-started run that is a blob storage key and a UUID (workflow.controller.ts:736–739 sets `initialCtx = {<ctxKey>: blobKey, documentId}`), never the filename. Dana's step 1 is explicit that she must find it "by the document rather than by remembering when it ran"; in practice she must already know the documentId and then scroll.


**VERIFIED 2026-07-27: still true.** The filter row is still status + two `DateInput`s + version; no free-text or document predicate.

**Proposed disposition:** fix

### G-045 — The graph has no containment object — only map declares a body; switch/pollUntil/humanGate/join/childWorkflow do not nest

**Found by:** C (1 pass) · **Severity:** major · **Type:** non-goal
**Surfaces:** canvas, canvas:map-body-box, settings-panel:poll-until, settings-panel:switch
**Source findings:** C-014
**Evidence:** packages/graph-workflow/src/types.ts:236

`bodyEntryNodeId`/`bodyExitNodeId` on `MapNode` is the model's ONLY scope marker; switch branches are plain edges, pollUntil repeats a single activity, humanGate/join are point nodes, and childWorkflow nests by embedding a separate config. Recording this as the non-goal it is: 'nesting' in Parts 3–9 means map bodies plus inline child graphs, nothing else. Everything the brief lists as a nesting combination therefore reduces to edge topology, which is why C-003/C-004 have nothing to check against.

**Proposed disposition:** won't-support

**Merge note:** Filed `major` but disposed `won't-support`: it reframes Pass C's whole nesting axis rather than proposing work, and it is why several of the brief's named nesting combinations have nothing to check against.

### G-046 — Two port families own a canvas handle you can drag onto but have no row in the Inputs panel and no problem badge

**Found by:** C (1 pass) · **Severity:** major · **Type:** design-gap
**Surfaces:** canvas:node-badge, canvas:port-rows, settings-panel:advanced-bindings, settings-panel:inputs
**Source findings:** C-020, C-021
**Evidence:** packages/graph-workflow/src/auto-wire/resolve-input-port.ts:65 · apps/frontend/src/features/workflow-builder/settings/input-row-resolution.ts:159

**Kindless ports.** `resolveInputPort` returns `unsatisfied` immediately when `port.kind === undefined`, and `resolveWireableInputRows` filters the port out entirely (`shouldAutoWirePort` is false) — yet `computePortRows` still emits a row plus an `in-<port>` handle. Five of the six binding states are therefore unreachable for this kind family, and the only way to bind it is a canvas drag or the raw advanced-bindings editor.

**Optional `Artifact` ports.** The wireable-row filter admits `shouldAutoWirePort(p) || (p.kind === "Artifact" && p.required === true)`, and `computeNodeInputIssues` applies the same rule — so an *optional* base-`Artifact` port is invisible to the settings panel, the badge and the drawer while still owning a canvas handle a user can drag onto. The `Artifact × {ambiguous, unsatisfied, locked, locked-unbound, ctx-bound}` cells are unrenderable for it.

In both cases the canvas offers an affordance the rest of the editor cannot describe or diagnose.


**VERIFIED 2026-07-27: the two halves are not comparable and should be ruled separately.** *Kindless ports*: **0 of the catalog's activities declare one** — five unreachable binding states for an empty port family. *Optional base-`Artifact` ports*: **26 across the catalog** (`file.prepare.fileName`/`.fileType`/`.contentType`, `azureOcr.poll.modelId`, `azureOcr.extract.fileName`, …), each owning a canvas handle that is invisible to the Inputs panel, the badge and the drawer. The second half is also the population behind the agent scenario-1 catalog-vs-runtime mismatch.

**Proposed disposition:** fix

**RULING (2026-07-27): fix — SHIPPED `467d7405`.** **Half fixed, half closed — the two are not comparable.**

*Optional base-`Artifact` ports (26 in the catalog): FIXED.* Hidden until bound. Hiding UNBOUND ones is deliberate, not an oversight — an existing test pins it and `file.prepare` alone would show three always-empty rows — so the fix is narrower than the entry implies. The real defect was that a binding made by dragging onto the canvas handle was invisible and un-undoable; a bound port is now visible and editable. An empty `ctxKey` does not count as bound.

*Kindless ports: CLOSED, no work.* Zero of the catalog's activities declare one. The five unreachable binding states describe an empty port family.

### G-047 — One node-status concept, three divergent unions — the API contract is the narrowest, and a cancelled run polls forever

**Found by:** C (1 pass) · **Severity:** major · **Type:** design-gap
**Surfaces:** preview-widget, run-state, run-status-badge, run:polling
**Source findings:** C-040, C-049
**Evidence:** packages/graph-workflow/src/types.ts:430 · apps/backend-services/src/workflow/dto/node-statuses-response.dto.ts:44

The engine writes both `nodeStatuses` (the `NodeStatusValue` union, with `completed`) and `nodeRunStatuses` (the DTO union, with `succeeded`) in lockstep, and nothing in the frontend imports the former — an orphaned third definition with no converter, no renderer and no consumer, against which any newly added surface would silently render nothing. The backend DTO is narrower still: it omits `cancelled` while `TERMINAL_NODE_STATUSES` includes it, and because the runtime never writes `cancelled`, a cancelled run's nodes stay `running` in the map and `run:polling` never satisfies its terminal-stop condition — it keeps polling at 1.5 s until the component unmounts. The run-status axis has no single domain definition to grid against.

**Proposed disposition:** fix (C-040) / defer (C-049) — **passes disagree**

**Merge note:** **Dispositions differ:** C-040 `fix`, C-049 `defer` (the cancel UX, US-141, owns the real answer for the DTO half).

**RULED 2026-07-26 — SPLIT.** The live defect (a cancelled run polled forever) is FIXED in `7c0ad059`: the endpoint now reports unfinished nodes of a CANCELLED/TERMINATED run as `cancelled`, so the canvas's terminal-stop fires. The cleanup half — three divergent node-status unions, one with no consumer — stays DEFERRED.

### G-048 — Two divergent node-delete implementations; the settings-panel one bypasses `resolveBindings` so the resolver never re-runs after a panel delete

**Found by:** D (1 pass) · **Severity:** major · **Type:** impl-gap
**Surfaces:** canvas, node-menu, page-shell, settings-panel
**Source findings:** D-012
**Evidence:** apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx:732

D102/D103. `deleteSelected` is a hand-copy of `removeNodesFromConfig` (canvas/WorkflowEditorCanvas.tsx:1674) and calls `setConfig` directly, whereas every canvas-originated mutation goes through `handleCanvasConfigChange`, which wraps the new config in `resolveBindings` (WorkflowEditorV2Page.tsx:357). So the partial self-heal — rebinding an orphaned consumer to an alternative upstream producer — happens after a canvas delete but not after a panel delete, until some unrelated canvas interaction happens to trigger it. Same event, two different graphs. It also means the two copies will drift the moment either gains a reference sweep.

**Proposed disposition:** fix

### G-049 — Retyping `CtxDeclaration.kind` never re-checks consumers already bound to that key

**Found by:** D (1 pass) · **Severity:** major · **Type:** design-gap
**Surfaces:** kind-select, settings-panel:inputs, variable-picker, workflow-settings
**Source findings:** D-018
**Evidence:** packages/graph-workflow/src/validator/validator.ts:1275

D46/D20. `CtxDeclaration.kind` is only step 2 of `resolvePortKind` — a fallback reached when the catalog port has no kind. So when both producer and consumer are catalog-typed the ctx kind is ignored entirely, and when neither is, both sides resolve to the *same* ctx kind and `isAssignable(K, K)` is trivially true. Only the mixed case errors. The VariablePicker will dim newly-incompatible rows, but only for future picks; existing bindings are never revisited. A retype that should invalidate half the graph is therefore silent in two of the three configurations.

**Proposed disposition:** fix

**RULING (2026-07-27): fix — SHIPPED `71e1b61e`.** The ctx row names the pinned inputs the current kind no longer satisfies, each a link to the node. Reported as state rather than as an event, so a graph that loads already mismatched says so too. Reads the same `computeNodeInputIssues` resolution the validation drawer uses, so the two surfaces cannot disagree. Only pinned bindings are attributed — an auto-wired port that stops matching re-resolves elsewhere, and the resolver cannot attribute that to any one key.

### G-050 — Deleting a workflow lineage cascade-deletes every version, including versions pinned by completed runs and by other workflows' `childWorkflow` nodes

**Found by:** D (1 pass) · **Severity:** major · **Type:** design-gap
**Surfaces:** run-history-drawer, run-row, settings-panel:child-workflow, version-history
**Source findings:** D-034
**Evidence:** apps/shared/prisma/schema.prisma:202

D70/D73/D74. `WorkflowVersion.lineage` is `onDelete: Cascade`. Ground-truth jobs (`Restrict`) and benchmark definitions (default `Restrict`) do block the delete, and `Document.workflowVersion` is `SetNull` — but runs are Temporal-side with no FK at all, so `RunSummaryDto.workflowVersionId` in the run-history drawer can point at a version row that no longer exists, and a `childWorkflow` version pin is just a number inside JSON that nothing scans. The protection model is therefore inconsistent by reference type rather than by consequence: the audit trail a run depends on is the least protected thing in the schema.

**Proposed disposition:** fix

**RULING (2026-07-27): fix — SHIPPED `5873aaa9`.** Scoped down on verification: benchmark definitions and ground-truth jobs are `Restrict` FKs and block the delete outright, and library references are caught by G-019's guard. The one silent loss is `Document.workflow_config_id` (`SetNull`) — the record of which graph produced each document. `GET /:id/delete-impact` lets the confirmation state that cost, and the `workflow_deleted` audit payload carries both counts so the loss stays attributable. The delete stays permitted: a workflow that has processed documents has to remain deletable.

### G-051 — Soft-deleting a dynamic node breaks version-pinned nodes at run time, directly contradicting the documented contract

**Found by:** D (1 pass) · **Severity:** major · **Type:** impl-gap
**Surfaces:** canvas:node-card, dynamic-node-editor, palette, settings-panel:dynamic-node
**Source findings:** D-035
**Evidence:** apps/temporal/src/dynamic-nodes/resolve-lineage.activity.ts:67

D76/D77. `apps/shared/prisma/schema.prisma:909` states that 'pinned versions of soft-deleted lineages continue to resolve at runtime'. The resolver throws `DynamicNodeDeletedError` on `lineage.deletedAt !== null` *before* the pinned-version branch is reached, so a node carrying an explicit `dynamicNodeVersion` fails anyway. This is the one place in the repo where the delete cascade was actually designed — the delete endpoint counts referencing workflows, the tombstone supports restore-on-republish, and the canvas shows a red 'Deleted' badge — which makes the divergence between the stated contract and the implementation the more important thing to fix: authors were told pinning protects them.


**VERIFIED 2026-07-27: TRUE, exactly as written.**

*(An earlier annotation on this entry called it inverted. That was wrong: it
read `dynamic-node.repository.ts`, which is the backend CRUD path, and never
reached `resolve-lineage.activity.ts`, which is the path the RUNTIME takes.
Corrected here rather than deleted, because the mistake is the useful part —
the repository is where the promise is written and the activity is where it is
broken, so checking either one alone gets the wrong answer.)*

The two disagree outright:

- `dynamic-node.repository.ts:325` states the contract — "version rows are kept
  so workflows pinned to a specific version of a soft-deleted lineage continue
  to resolve at runtime" — and `findVersionByNumber` duly does not filter on
  `deletedAt`.
- `resolve-lineage.activity.ts:67` throws `DynamicNodeDeletedError` the moment
  `lineage.deletedAt !== null` — **before** the pinned-version branch at :72 is
  ever reached. The pin is never consulted.

So soft-deleting a lineage breaks every consumer, pinned or not, and the pinned
case is the one the design explicitly promised would survive. Preserving the
version rows achieves nothing at run time today.

**Proposed disposition:** fix

**RULING (2026-07-27): fix — SHIPPED `7e88a7f4`.** The `deletedAt` check now applies only to head-tracking consumers, honouring the contract `softDelete` documents and keeps version rows for. A missing lineage, a missing pinned version and a head-tracking consumer all still fail exactly as before. Design doc updated — it described the deleted-node affordance without stating that a pinned consumer survives, which is why the drift went unnoticed.

### G-052 — J1.5 — a workflow that extracts and then stores nothing validates as "Valid"; nothing warns that a produced result is never consumed or persisted

**Found by:** A (1 pass) · **Severity:** major · **Type:** design-gap
**Surfaces:** topbar:validation-button, validation-drawer, validation-engine
**Source findings:** A-005
**Evidence:** packages/graph-workflow/src/validator/validator.ts:1045

The only whole-graph warnings the validator emits are unreachable-node (`nodes.<id>`, :1045) and multi-group membership (:1150). There is no check that a terminal node's output ctx key is read by anything or handed to `ocr.storeResults`. Priya's step 5 explicitly anticipates the failure mode "the result is being read but not kept anywhere" — the product gives her a green "Valid" badge in exactly that state. She would only discover it by noticing that nothing exists at the end, which is the same problem she was trying to avoid.


**VERIFIED 2026-07-27: still true.** No unconsumed-output or terminal-persistence check exists anywhere in the validator.

**Proposed disposition:** fix

### G-053 — J2 edge branch — no way to exercise the failure path without actually breaking a file: no dry-run, no simulated error, no branch preview

**Found by:** A (1 pass) · **Severity:** major · **Type:** design-gap
**Surfaces:** canvas:wire, preview-widget, run-drawer
**Source findings:** A-011
**Evidence:** apps/frontend/src/features/workflow-builder/run/RunWorkflowDrawer.tsx:90

`run-drawer` offers exactly two modes, `run` and `try`, both of which execute the real graph against real input. Nothing lets an author force a node to fail so the containment branch is observed. Marcus states the requirement explicitly ("check that he described it correctly without deliberately breaking a file to test it"). Deferring behind A-010: there is nothing to rehearse until the policy is authorable.

**Proposed disposition:** defer

### G-054 — J3.2 — a keyword split pattern cannot be tried against a real sample before committing; the editor validates regex syntax only

**Found by:** A (1 pass) · **Severity:** major · **Type:** design-gap
**Surfaces:** preview:segments, settings-panel:params, widget:keyword-pattern
**Source findings:** A-013
**Evidence:** apps/frontend/src/features/workflow-builder/settings/rich-widgets/KeywordPatternEditor.tsx:98

`KeywordPatternEditor` renders pattern + segment-type rows with an inline invalid-regex error and nothing else — no sample text, no match count, no "which pages would this catch". Marcus's step 2 is explicit: "He expects to be able to see, on a real sample, which pages each pattern matched before he commits to it." The only way to find out is to save, run a package, and read `preview:segments` on the `document.splitAndClassify` node — i.e. after committing, and only if the run reached that node and its cache row is still fresh.


**VERIFIED 2026-07-27: still true.** `KeywordPatternEditor` still offers no sample text, match count or preview.

**Proposed disposition:** fix

### G-055 — J5.3 — a threshold cannot be varied per group at run time: exposed params are authorable but only the benchmark module can supply values for them

**Found by:** A (1 pass) · **Severity:** major · **Type:** impl-gap
**Surfaces:** exposed-params-editor, run-drawer, settings-panel:group
**Source findings:** A-021
**Evidence:** apps/backend-services/src/benchmark/workflow-config-overrides.ts:18

`NodeGroup.exposedParams` is the product's answer to "a value I can change without touching the structure", and the engine threads `workflowConfigOverrides` down through map child workflows. But the only code that turns exposed params into overrides lives under `apps/backend-services/src/benchmark/`, and `StartRunRequestDto` accepts only `initialCtx` and `workflowVersionId` (apps/backend-services/src/workflow/dto/start-run.dto.ts:21) — no overrides field, and `run-drawer` renders no exposed-param inputs. Dana's step 3 ("change it for one group without affecting another") therefore reduces to editing the node's parameter and cutting a new version, which changes it for everyone.


**VERIFIED 2026-07-27: still true.** `StartRunRequestDto` still exposes only `initialCtx` and `workflowVersionId` — no overrides field.

**Proposed disposition:** fix

### G-056 — J6.1 — the "logical stages" overview only exists if the previous author happened to create groups; nothing derives structure from the graph

**Found by:** A (1 pass) · **Severity:** major · **Type:** design-gap
**Surfaces:** auto-arrange, canvas:group-chip, topbar:more-menu
**Source findings:** A-025
**Evidence:** apps/frontend/src/features/workflow-builder/canvas/group-projection.ts:57

Simplified view projects one chip per `config.nodeGroups` entry (`chipIdForGroup`). With no groups authored it is a no-op and Sam gets 16 undifferentiated nodes — precisely the state J6 step 1 says must not happen ("Sam expects the structure to be legible at a scale larger than individual steps"). Grouping is an optional authoring act by the person who has left; nothing infers stages from reachability, kind families, or `document.*`/`ocr.*` category boundaries, and `auto-arrange` only re-positions.


**VERIFIED 2026-07-27: still true.** Nothing infers stages from the graph; simplified view still projects `config.nodeGroups` only.

**Proposed disposition:** fix

### G-057 — J7.5 — a step's INPUTS are never shown; only outputs are cached, so "handed bad input" vs "corrupted good input" must be inferred from the neighbour's preview

**Found by:** A (1 pass) · **Severity:** major · **Type:** design-gap
**Surfaces:** preview-widget, settings-panel:inputs, wire-peek
**Source findings:** A-033
**Evidence:** apps/frontend/src/features/workflow-builder/preview/preview.types.ts:23

`ActivityOutputPreview` is `{outputCtx, outputKind, createdAt, expiresAt}` and the cache decorator snapshots only the node's declared output leaf paths (`collectOutputLeafPaths` / `snapshotCtxDelta`, apps/temporal/src/graph-engine/node-executors.ts:223/:246). `wire-peek` partially rescues step 5 — clicking the incoming data wire reads the PRODUCER's `outputCtx` at that ctx key and works in replay (WirePeekPopover.tsx:79 uses `activeRunId` regardless of `isReplay`). But that only works where a derived data wire exists: a port bound to a plain declared ctx key, an input satisfied by `initialCtx`, or any control-flow node produces no wire and therefore no peek, and A-003 means the peeked value is a blob pointer for the whole OCR chain anyway.


**VERIFIED 2026-07-27: still true.** `ActivityOutputPreview` is still output-only, and the cache decorator still snapshots declared OUTPUT leaf paths only.

**Proposed disposition:** fix

### G-058 — J7.6 — a human correction leaves no trail Dana can read: audit rows exist server-side but no surface renders reviewer, time, or before/after values

**Found by:** A (1 pass) · **Severity:** major · **Type:** design-gap
**Surfaces:** preview-widget, run-history-drawer, run-row
**Source findings:** A-035
**Evidence:** apps/backend-services/src/hitl/hitl.service.ts:378

`submitCorrections` writes per-field rows (`original_value`, `corrected_value`, `original_conf`, `action`) and a `review_corrections_submitted` audit event, so the data Dana needs exists. Nothing in the frontend reads it — a grep of `apps/frontend/src/features` and `src/pages` for an audit viewer finds only a benchmarking component. J7's "done" requires "if the cause was a human correction, she can name the reviewer and the session". Deferring rather than fix-now: this is a viewer over data that already exists, and it is downstream of A-019/A-020 (today a human correction cannot influence a graph run's result at all).

**Proposed disposition:** defer

**RULED 2026-07-26 — FIXED** (`5b154167`). Most of the entry had already shipped: `CorrectionHistory` renders field, action, timestamp and before/after from a real query. What was genuinely missing was WHO — the session now returns `reviewerEmail` and the trail names the reviewer. Also deleted `useCorrections`, a dead stub returning an empty list.

### G-059 — J7.7 — two runs cannot be compared; Compare-to-head diffs configs, never run values

**Found by:** A (1 pass) · **Severity:** major · **Type:** design-gap
**Surfaces:** compare-to-head, preview-widget, run-history-drawer
**Source findings:** A-036
**Evidence:** apps/frontend/src/features/workflow-builder/versioning/CompareToHeadModal.tsx:1

The only comparison surface in the product compares a version's config against head. Replay is single-run: `RunStateContext` holds one `activeRunId`, so two runs cannot be on screen at once, let alone their per-node values. J7 step 7 ("compare against a run of the same package that came out right, if one exists") is a wall. Deferring — it is conditional in the journey ("if one exists") and is dominated by A-032, which usually means the good run's values are gone too.

**Proposed disposition:** defer

### G-060 — Moving a multi-selection does not persist the other nodes' positions

**Found by:** B (1 pass) · **Severity:** major · **Type:** impl-gap
**Surfaces:** auto-arrange, canvas, page-shell
**Source findings:** B-007
**Evidence:** apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx:2151

xyflow types the drag callback as `OnNodeDrag = (event, node, nodes) => void` (node_modules/@xyflow/react/dist/esm/types/nodes.d.ts:36) — the third argument is the full dragged set. `handleNodeDragStop` destructures only `(_event: React.MouseEvent, node: Node)` (cited line) and writes `metadata.position` for that single `node` (`:2196`, `:2205`). It then bumps `lastFingerprintRef` by hand (`:2204`) so the structural-sync effect will NOT re-project — meaning the other selected nodes keep their new on-screen positions locally while their config positions are stale, and the divergence is invisible until reload. `onSelectionDragStop` (a distinct prop, `component-props.d.ts:144`) is not wired at all, so dragging via the selection-box handle persists nothing whatsoever. Repro: shift-drag a box over three nodes, drag them 200px right, hit Save, reload — the two non-grabbed nodes snap back. This is the only multi-select operation the editor claims to support besides delete and 'Group selected' (`WorkflowEditorV2Page.tsx:1138`), and it is silently lossy.

**Proposed disposition:** fix

**RULING (2026-07-27): fix — SHIPPED `9e6a1515`.** xyflow hands `onNodeDragStop` the full dragged set as its third argument; the handler read only the second. Every moved node is now persisted, with non-graph ids in the set (chips, map-body containers) skipped.

### G-061 — Switch cases cannot be reordered even though the UI states evaluation is order-dependent

**Found by:** B (1 pass) · **Severity:** major · **Type:** design-gap
**Surfaces:** canvas:edge-label, condition-editor, settings-panel:switch
**Source findings:** B-012
**Evidence:** apps/frontend/src/features/workflow-builder/settings/control-flow/SwitchNodeSettings.tsx:137

The panel tells the user order matters — 'Cases are evaluated in order.' (cited line) — and then offers only append (`addCase`, `:103`) and remove-by-index (`removeCaseAt`, `:105`). There is no move-up/move-down, no drag handle, no reorder of any kind (`rg -ni 'reorder|move up|IconGripVertical|drag'` across `settings/rich-widgets/`, `settings/group/` and `sources/FieldListEditor.tsx` returns a single unrelated ConfusionMapEditor comment). To insert a new case ahead of an existing one — the ordinary way a decision table evolves — the user must delete the later cases and re-author each condition tree in the recursive `ConditionExpressionEditor`, then re-point each `SwitchCase.edgeId`. The component even notes cases 'have no stable id and are an ordered list editable by index' (`:148`–`:149`), so the ordering is load-bearing and unmanaged. Same class of hole applies to every other ordered list editor in the feature (page ranges, keyword patterns, classification rules, validation rules, source fields), but switch is where order changes semantics.

**Proposed disposition:** fix

### G-062 — A save rejected by the backend validator loses every error detail on the way to the toast

**Found by:** B (1 pass) · **Severity:** major · **Type:** impl-gap
**Surfaces:** page-shell, topbar, validation-drawer
**Source findings:** B-020
**Evidence:** apps/frontend/src/data/services/api.service.ts:166

The backend rejects an invalid config with a structured body — `throw new BadRequestException({ message: 'Invalid workflow configuration', errors: validation.errors })` (`apps/backend-services/src/workflow/workflow.service.ts:734`–`:738`) where `errors` is the `GraphValidationError[]` carrying path/message/severity per node. The frontend transport extracts `message` and nothing else (cited line and the branches at `:168`–`:179`; the sibling `errors` key is never read), `useUpdateWorkflow` re-wraps that string (`apps/frontend/src/data/hooks/useWorkflows.ts:167`), and `handleSave`'s catch renders it as a red notification (`WorkflowEditorV2Page.tsx:794`–`:800`). Result: 'Save failed — Invalid workflow configuration', with no node, no path, and nothing routed into `validation-drawer`. This is not covered by the client-side validator, because the backend runs the dynamic-node-aware pass (`validateGraphConfigWithDynamicNodes`, `workflow.service.ts:728`) that the client cannot reproduce — so there is a real class of saves that fail with zero actionable feedback and no retry path other than guessing.

**Proposed disposition:** fix

**RULED 2026-07-26 — SHIPPED.** Fixed by D-4 (`1d8ad3ad`): `WorkflowSaveError` carries the validator's anchors through to the toast. The commit never named this entry, which is why it still read as open.

### G-063 — Two tabs on one workflow silently lose the first author's changes — no lost-update detection on save

**Found by:** B (1 pass) · **Severity:** major · **Type:** design-gap
**Surfaces:** page-shell, topbar, version-history
**Source findings:** B-021
**Evidence:** apps/backend-services/src/workflow/workflow.controller.ts:1454

`PUT /workflows/:id` accepts `@Param('id')` and `@Body() dto: Partial<CreateWorkflowDto>` only (cited signature) — no If-Match, no ETag, no expected-version field on the DTO. The service appends a version on top of whatever head happens to be at commit time (`apps/backend-services/src/workflow/workflow.service.ts:764`–`:788`: read head, compare configs, `version_number + 1`, repoint `head_version_id`) and its only conflict handling is to RETRY on the version-number unique constraint (`:802`–`:813`), which makes silent clobbering more reliable rather than less. On the client, the hydration guard deliberately refuses to adopt server state while local edits exist (`apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx:513`), so tab B never learns tab A saved. Sequence: both tabs load v5, A saves (v6), B saves (v7 built from v5) — A's work is gone from head, with no warning to either party. The mitigation is real but manual and after-the-fact: 'Revert to this version' in the history drawer (`versioning/VersionHistoryDrawer.tsx:206`) requires noticing the loss first. Fix = send the loaded `version_number` and 409 on mismatch; the versioning model already stores everything needed.

**Proposed disposition:** fix

**RULING (2026-07-27): fix — SHIPPED `f9049ab3`.** `PUT /api/workflows/:id` requires `expectedVersion` and answers 409 `workflow_version_conflict` naming both versions. Required rather than optional on purpose — an optional token is only honoured by callers who already thought about concurrency, which are exactly the callers who did not need it. The check runs twice; the one inside the append transaction is the one that decides. The editor shows a distinct "Someone else saved first" notice, since a stale base is not a config problem.

### G-064 — wire-peek shows the cache-evicted recovery alert in replay for a producer that never ran or failed

**Found by:** C (1 pass) · **Severity:** major · **Type:** impl-gap
**Surfaces:** cache-evicted-alert, run-state, wire-peek
**Source findings:** C-042
**Evidence:** apps/frontend/src/features/workflow-builder/canvas/WirePeekPopover.tsx:119

The popover branches on `isReplay` alone. `PreviewWidget.tsx:49` added `producedOutput(status)` precisely so a 404 on a `failed` / `pending` / branch-not-taken node stops blaming the cache; `WirePeekPopover` never reads `nodeStatuses` at all. Peeking a wire out of an untaken switch branch offers a 'Re-run to repopulate' button that will repopulate nothing.


**VERIFIED 2026-07-27: ALREADY FIXED by G-012.** `WirePeekPopover` reads `producerStatus` from `nodeStatuses` and derives its copy through the shared `noOutputReasonForNode`, so it no longer blames the cache for a node that never ran.

**Proposed disposition:** fix

**Merge note:** Distinct from the 24 h-TTL entry despite sharing the `cache-evicted-alert` surface: that one is about values genuinely expiring and the remedy being wrong, this one is about the alert firing when eviction is not the cause.

### G-065 — Renaming or retyping an `isInput` ctx declaration silently rewrites the workflow's public run-spec input contract

**Found by:** D (1 pass) · **Severity:** major · **Type:** design-gap
**Surfaces:** run-drawer, topbar, workflow-settings
**Source findings:** D-019
**Evidence:** apps/backend-services/src/workflow/derive-input-schema.ts:202

D43. `deriveFromCtx` builds the run-spec JSON Schema directly from `config.ctx` entries flagged `isInput`, using the declaration's key as the property name and its `type` verbatim. So an in-editor rename or type change silently changes the request body every existing API caller must send, and the curl sample in the run drawer changes with it. Nothing warns that the key is part of an external contract; the drawer renders `isInput` as an ordinary checkbox column. `CtxDeclaration.type` is otherwise not validated against anything in the graph, so this is its only real consumer.

**Proposed disposition:** fix

**RULING (2026-07-27): fix — SHIPPED `15db9e5f`.** The ctx row states what the flag does to the public contract, in the caller's terms: required, optional (a default fills the gap), or inert. The inert case is the same defect from the other side — under a `source.api` node or the library kind the flag changes nothing at all, and the drawer said so no more clearly than it said the rest. `ctxRunContract` mirrors `derive-input-schema.ts`'s precedence and its tests assert that order, so a change there fails here rather than leaving the drawer describing a contract the backend does not publish.

### G-066 — `KindSelect` reads the frozen registry snapshot, so a dynamically registered kind renders blank and is overwritten on the next edit

**Found by:** D (1 pass) · **Severity:** major · **Type:** impl-gap
**Surfaces:** kind-select, library-port-editor, workflow-settings
**Source findings:** D-025
**Evidence:** apps/frontend/src/features/workflow-builder/settings/kind-select-options.ts:106

D67/D63. `buildKindSelectOptions` iterates `Object.keys(ARTIFACT_REGISTRY)` — the `Object.freeze`d v1 snapshot, whose own doc comment says it does not reflect runtime registrations and that callers needing the live view must use `getArtifactKindMeta`. A kind added via `registerArtifactKind` therefore has no option, so `kindRefToSelectValue` hands Mantine a value absent from `data` and the field renders empty; the next `onChange` writes whatever the author picks over a kind they could not see. This is the mutation-axis half of the frozen-vs-live split: the read degrades gracefully everywhere else, but here it silently destroys the stored value.


**VERIFIED 2026-07-27: structurally true but NOT LIVE.** `buildKindSelectOptions` still reads the frozen `ARTIFACT_REGISTRY`, but `registerArtifactKind` has **zero production call sites** — only tests call it. No kind can be dynamically registered today, so the stored value this would destroy cannot exist. Rule it as a latent trap (like G-081), not as a live defect.

**Proposed disposition:** fix

### G-067 — J4.3 — map fan-out defaults to UNBOUNDED concurrency; the skeleton omits `maxConcurrency` and the form gives no hint of the service limits it is meant to protect

**Found by:** A (1 pass) · **Severity:** major · **Type:** impl-gap
**Surfaces:** palette, settings-panel:map
**Source findings:** A-016
**Evidence:** apps/temporal/src/graph-engine/node-executors.ts:598

`const maxConcurrency = node.maxConcurrency || Infinity;` and `buildMapSkeleton` (apps/frontend/src/features/workflow-builder/palette/control-flow-skeletons.ts:60) sets `collectionCtxKey`, `itemCtxKey`, `bodyEntryNodeId`, `bodyExitNodeId` and nothing else. So a map dropped from the palette will launch all 300 pages at once. `MapNodeSettings` does render an optional `maxConcurrency` NumberInput (>= 1), but it is blank by default and its description says nothing about downstream rate limits. Marcus's step 3 ("he does not want to find out by being throttled") is exactly the outcome the default produces, and the one control that prevents it is opt-in and unlabelled as a safety setting.

**Proposed disposition:** fix

**RULED 2026-07-26 — FIXED** (`8fb19d57`). The palette skeleton seeds a concurrency limit and the validator warns when one is absent.

### G-068 — J5.5 — escalation cannot be modelled: an escalated review session sets a status and stops; nothing routes it to a different person or back to the run

**Found by:** A (1 pass) · **Severity:** major · **Type:** design-gap
**Surfaces:** settings-panel:human-gate, settings-panel:switch
**Source findings:** A-024
**Evidence:** apps/backend-services/src/hitl/hitl.service.ts:463

`escalateSession` writes `ReviewStatus.escalated` and an audit event and, like `approveSession`, sends no signal. On the authoring side a humanGate has exactly one resume path and one timeout path (`fail`/`continue`/`fallback`) — there is no "which decision did the reviewer make" branch and no way to name a second reviewer pool. Dana's "escalation should reach a different person, not loop back to the same queue" has no expression in the graph model. Deferring behind A-019/A-020: the ordinary approve path has to work before escalation is meaningful.

**Proposed disposition:** defer

### G-069 — Nested map bodies produce overlapping synthetic groups; mergeNodeGroups only de-conflicts user-vs-synthetic

**Found by:** C (1 pass) · **Severity:** major · **Type:** design-gap
**Surfaces:** canvas:group-chip, canvas:map-body-box
**Source findings:** C-002
**Evidence:** apps/frontend/src/features/workflow-builder/canvas/map-body-groups.ts:133

`synthesizeMapBodyGroups` emits one group per map and its BFS walks straight through an inner map's body, so an inner body's nodes belong to both `__map_body_outer` and `__map_body_inner`. `mergeNodeGroups` filters only against user-named groups, never synthetic-vs-synthetic — two dashed green boxes claim the same cards. Map-inside-map was never specified as a supported nesting.


**VERIFIED 2026-07-27: still true.** `mergeNodeGroups` filters synthetic ids against user-claimed nodes only; nothing de-conflicts synthetic-vs-synthetic.

**Proposed disposition:** fix

### G-070 — humanGate inside a map body registers one signal handler per iteration under the same name

**Found by:** C (1 pass) · **Severity:** major · **Type:** design-gap
**Surfaces:** settings-panel:human-gate, settings-panel:map
**Source findings:** C-006
**Evidence:** apps/temporal/src/graph-engine/node-executors.ts:809

`executeHumanGateNode` calls `setHandler(defineSignal(node.signal.name), …)`. In-process map branches run concurrently in the same workflow, so N iterations register N handlers under one name — Temporal keeps the last, and one signal resolves at most one branch. The remaining iterations block to `timeout`. Per-iteration gating was never specified; neither was signal-name uniqueness across a graph.

**Proposed disposition:** fix

**RULING (2026-07-27): fix — SHIPPED `7702e5e8`.** Refused at validation time. Confirmed unfixable-as-is first: the backend resumes by signalling the workflow id with the FIXED name `"humanApproval"`, so there is no per-iteration address even if the handlers were distinct. Per-iteration signal routing would be a new feature; the shape simply cannot work today. 12 human gates ship, none in a loop body, so the rule invalidates nothing.

### G-071 — Map body-entry/exit pickers have no node-type filter — source, join, humanGate or another map can be a body entry

**Found by:** C (1 pass) · **Severity:** major · **Type:** design-gap
**Surfaces:** node-picker, settings-panel:map
**Source findings:** C-008
**Evidence:** apps/frontend/src/features/workflow-builder/settings/control-flow/MapNodeSettings.tsx:177

The body-entry `NodePicker` passes no `filterType` and only excludes the map itself; body-exit adds reachability but no type filter. A `source` node as a body entry is meaningless (no inputs, runs once at graph entry), and a nested `map`/`join` entry walks straight into C-002/C-003. Which node types may open or close an iteration was never specified.

**Proposed disposition:** fix

**RULING (2026-07-27): fix — SHIPPED `9de30797`.** The body-entry picker excludes `source` (runs once at intake, not per item), `join` (exists to follow a loop) and `humanGate` (refused inside a body by G-070, so offering it was offering a guaranteed Save error). Nested loops stay listed — that shape is legitimate and `validateJoinScope` reasons about it explicitly.

### G-072 — Canvas port rows collapse the six-state binding model into bound/needs-source, and get one state backwards — `locked-unbound` renders as satisfied

**Found by:** C (1 pass) · **Severity:** major · **Type:** design-gap + impl-gap
**Surfaces:** canvas:port-rows, settings-panel:inputs
**Source findings:** C-022, C-023, C-024
**Evidence:** apps/frontend/src/features/workflow-builder/canvas/port-rows.ts:144 · :145 · apps/frontend/src/features/workflow-builder/canvas/PortRows.tsx:170

`bound = wireTargeting !== undefined || binding !== undefined` never consults `resolveInputPort`. The resolver's own comment documents the case that breaks it: a ctxKey-less input stub can survive a canvas edge-delete, so the port is `locked-unbound` — "Disconnected by you", a red CTA in the settings panel — while `binding !== undefined` makes the canvas draw it as satisfied with no amber ring. `ambiguous` on a required port and `unsatisfied` are also visually identical there.

Two narrower divergences ride along. The from-ctx chip uses an exact `config.ctx[binding.ctxKey]` test while the validator resolves ctx bindings on the *root* key, so a port bound to `doc.field` or `invoice.total` is `ctx-bound` in the panel ("from doc.field") and chip-less on the canvas. And `row.kind ?? "Artifact"` makes a port with no declared kind indistinguishable in the DOM and in handle colour from a deliberate `Artifact` wildcard, even though the two behave differently in `isAssignable` — cosmetic today, but it is the attribute e2e assertions key on.

**Proposed disposition:** fix (C-022, C-023) / defer (C-024) — **passes disagree**

**RULED 2026-07-26 — SPLIT.** The live defect (`locked-unbound` rendering as satisfied, so canvas and settings panel disagreed about one port) is FIXED in `514a0896`. The wider six-state canvas fidelity stays DEFERRED.

### G-073 — Two raw NUL bytes in WorkflowEditorCanvas.tsx make grep/ripgrep classify the feature's largest source file as binary

**Found by:** C (1 pass) · **Severity:** major · **Type:** impl-gap
**Surfaces:** canvas
**Source findings:** C-071
**Evidence:** apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx:2745

`dataWireSig` joins its parts with raw U+0000 bytes written literally into the source rather than as the `\0` escape (verified: the file contains exactly 2 NUL bytes, both on this line). POSIX grep and ripgrep treat any file containing a NUL as binary and return NOTHING with exit status 1 - silently, and indistinguishably from 'no matches'. This is the most-edited file in Parts 3-9 (3180 lines, 119 KB) and it is the only file in apps/** or packages/** with this property, so every grep-driven search, IDE find-in-files, and code-review tool pointed at the feature has a hole in exactly the wrong place. Not hypothetical: it produced a false 'no caller' result in this very audit (a withdrawn finding claiming the active-edge animation was dead code, when it is wired at :2124 and :2143). Fix is one character per byte - `\0` or a printable delimiter - with no behaviour change, since the string is only used as an internal de-dup key.

**Proposed disposition:** fix

**Merge note:** Tooling, not product: it is the reason one finding (C-041) had to be withdrawn during re-verification, and two of the four passes hit it independently. Any negative claim about this file made without `grep -a` should be treated as unverified.

**RULED 2026-07-26 — SHIPPED.** Verified: 0 NUL bytes in `WorkflowEditorCanvas.tsx` today. The file reads as UTF-8 text and greps normally.

### G-074 — Ctx-key rename collision is a silent no-op and leaves the Name field displaying the rejected new name

**Found by:** D (1 pass) · **Severity:** major · **Type:** impl-gap
**Surfaces:** workflow-settings
**Source findings:** D-015
**Evidence:** apps/frontend/src/features/workflow-builder/settings/WorkflowSettingsDrawer.tsx:73

D45. The guard `if (oldKey === newKey || newKey === "" || config.ctx[newKey]) return;` rejects a collision by doing nothing. Because the parent config is unchanged, the row's `ctxKey` prop does not change either, so the effect that re-syncs `localName` never fires and the input keeps showing the name the model rejected. The author believes the rename happened. There is also no identifier validation on rename at all (contrast `NEW_CTX_KEY_RE` on the creation path in VariablePicker), so `"my key"` or a dotted name is accepted and silently breaks root-key resolution everywhere.

**Proposed disposition:** fix

**RULING (2026-07-27): fix — SHIPPED `eefa8389`.** The row knows the other declared names, shows the collision live, and keeps the typed text on blur instead of snapping back — the author has to see and resolve it rather than have it undone. The refusal itself was already correct (`renameCtxKeyInConfig` would merge the two declarations); what was missing was saying so.

### G-075 — "Needs a source" is the same message whether the kind is a typo, the cardinality is wrong, or no producer exists

**Found by:** C (1 pass) · **Severity:** minor · **Type:** design-gap
**Surfaces:** canvas:node-handle, kind-select, producer-picker, settings-panel:inputs, validation-drawer, variable-picker
**Source findings:** C-028, C-029
**Evidence:** packages/graph-workflow/src/types/subtype-check.ts:102 · :54

Failing closed on an unrecognised kind is the documented intent (TYPED_IO_DESIGN §8), but no validator pass checks `PortDescriptor.kind`, `CtxDeclaration.kind` or `LibraryPortDescriptor` against the live registry — so a typo presents as "Needs a source" on every consumer with no hint that the kind itself is the problem, and `handle-style.ts` greys the handle exactly as it does for a legitimate multi-port side. Separately, `isAssignable` rejects on `arrayDepth` before it ever walks `baseKind`, so a `Document` producer feeding a `Document[]` port is indistinguishable from an empty upstream; only `variable-picker`'s `data-incompatible-reason` comes close, and it is not shown by the Inputs CTA path.


**VERIFIED 2026-07-27: still true.** No validator pass compares any `kind` field against the live registry.

**Proposed disposition:** fix

### G-076 — No way to inspect the run's ctx blackboard as a whole — values are only visible node-by-node or wire-by-wire

**Found by:** B (1 pass) · **Severity:** minor · **Type:** design-gap
**Surfaces:** preview-widget, run-state, validation-drawer, wire-peek, workflow-settings
**Source findings:** B-026
**Evidence:** apps/frontend/src/features/workflow-builder/preview/useActivityOutputPreview.ts:1

Every observation surface is keyed to one node or one wire: the preview query is per-node (cited hook, batched by node id) and `wire-peek` reads one ctx key off one wire's cached delta (`canvas/WirePeekPopover.tsx`). `workflow-settings` lists ctx DECLARATIONS (name/type/kind/isInput — `settings/WorkflowSettingsDrawer.tsx:159`) but never their runtime values. So questions of the form 'what is in ctx right now' or 'who last wrote `preparedFileData`' require clicking around the canvas and mentally reassembling the blackboard — and for a key whose producer output is not the node's first binding, the value may not be reachable at all (B-016). Deferred rather than fixed: the per-node view covers the common case, and a variables panel is only clearly worth its weight once B-016/B-017 have closed the cheaper holes in the same area.

**Proposed disposition:** defer

### G-077 — Cross-journey — a node's problems badge counts unbound inputs but not any of the failure modes the journeys actually hit

**Found by:** A (1 pass) · **Severity:** minor · **Type:** design-gap
**Surfaces:** canvas:node-badge, topbar:validation-button, validation-drawer, validation-engine
**Source findings:** A-038
**Evidence:** apps/frontend/src/features/workflow-builder/auto-wire-validation.ts:17

The unified problems surface merges core validator errors, auto-wire input health, and map-body reachability. Nothing in it flags: an output nothing consumes (A-005), unbounded map concurrency (A-016), a humanGate whose signal name nothing sends (A-023), a control-flow node with no output bindings (A-022), or a node with no error policy inside a fan-out (A-010/A-018). Every one of those is a state a journey author lands in while the top bar reads "Valid". Recording once at low severity rather than as five separate findings; the individual fixes are the ones ranked above.

**Proposed disposition:** defer

**Merge note:** A deliberate roll-up by Pass A of five "the problems badge doesn't count this" observations. The underlying fixes are the individually-ranked entries elsewhere in this register.

**RULED 2026-07-26 — PARTIAL FIX** (`8fb19d57`). The one check unambiguous from the config alone — a map with no concurrency limit — now warns, paired with a palette skeleton default (G-067). The other two the entry names are NOT being added: measured against the shipped set, "output nothing consumes" would fire on 23 of 111 bound outputs (mostly deliberate diagnostics) and "no error policy" on nearly every node. Both need the model to carry information it does not have — a way to mark an output terminal, and a notion of failure-prone activities — so they are design questions, not rules.

### G-078 — Cache-hit metadata is fetched on every poll and rendered nowhere, leaving `skipped` ambiguous

**Found by:** B (1 pass) · **Severity:** minor · **Type:** impl-gap
**Surfaces:** canvas:node-card, preview-widget, run-status-badge, run:polling
**Source findings:** B-018
**Evidence:** apps/frontend/src/features/workflow-builder/run/node-status.types.ts:57

`NodeRunStatus.cacheHit` (cited line) carries `{ configHash, inputHash }` and its doc comment states the intent outright: 'the Phase 4 cache decorator (US-128) records which cache row served the output so the canvas can surface "served from cache" UX' (`:35`–`:38`). No surface reads it — `rg -n 'cacheHit' apps/frontend/src --glob '!*.test.*'` returns only this declaration. Meanwhile `skipped` renders as a violet `IconBolt` with no tooltip and no distinguishing text (`run/NodeStatusBadge.tsx:62`; the tooltip branch at `:118` fires only for `failed`), and `PreviewWidget.producedOutput` treats `skipped` as 'produced output' (`preview/PreviewWidget.tsx:49`). So 'skipped because a cached row was reused' and 'skipped because the branch wasn't taken' are the same violet dot. That directly undercuts test-plan Part 9.6's cache story: the user cannot tell whether a re-Try actually hit cache. The data is already on the wire — this is a rendering gap, not a plumbing one.


**VERIFIED 2026-07-27: still true.** `cacheHit` appears in `node-status.types.ts` and nowhere else in non-test frontend source.

**Proposed disposition:** fix

### G-079 — Diff is side-by-side raw JSON against head only — no structural diff, no arbitrary version pair, no 'what have I changed this session'

**Found by:** B (1 pass) · **Severity:** minor · **Type:** design-gap
**Surfaces:** compare-to-head, page-shell, topbar:more-menu, version-history
**Source findings:** B-023
**Evidence:** apps/frontend/src/features/workflow-builder/versioning/CompareToHeadModal.tsx:13

The modal's own header states the shape and the deferral: 'two JsonInput blocks is the explicit Track 3 deliverable. Structural diff is filed for Phase 4' (cited line). Three consequences for a Parts 3–9 author. (1) Comparing a 40-node config as two raw JSON panes does not answer 'which node changed' — node order in the object, `metadata.position` churn from any drag, and `configHash` restamping all move together with real edits. (2) Only version-vs-head is offered: `handleCompare` passes a single version id (`versioning/VersionHistoryDrawer.tsx:147`) and the Compare button is disabled on head itself (`:219`), so two historical versions cannot be compared. (3) There is no in-session diff — nothing shows the delta between the loaded config and the unsaved working copy, even though `lastHydratedConfigRef` (`WorkflowEditorV2Page.tsx:492`) already holds exactly that baseline. Deferred: the capability is acknowledged and scheduled, and (3) is the piece worth pulling forward because the baseline is already in hand.

**Proposed disposition:** defer

**RULED 2026-07-26 — DEFER.** Same underlying fact as G-094 (the diff is textual, not structural). Consider merging the two entries.

### G-080 — Breakpoints, stepping, and mid-run intervention are out of scope for the editor

**Found by:** B (1 pass) · **Severity:** minor · **Type:** non-goal
**Surfaces:** canvas:node-card, run-drawer, run-state, run:polling
**Source findings:** B-025
**Evidence:** apps/frontend/src/features/workflow-builder/run/useNodeStatuses.ts:1

Recorded so roster item 8 is not read as demanding a step-debugger. Execution happens in Temporal, out of process; the editor observes it through a 1.5 s poll of a node-status endpoint (cited file; INVENTORY §2.7 `run:polling`) and a read-only output cache. A breakpoint would require the engine to offer suspend/resume at node granularity, which is an engine capability, not an editor one — and the product already has a first-class, designed mechanism for deliberate mid-run pausing: the `humanGate` node. Post-hoc inspection (previews, wire peek, run history, replay) is the right shape for this architecture. The genuine item-8 gaps are that the post-hoc view is incomplete — filed as B-016, B-017, B-018 and B-026 — not that stepping is missing.

**Proposed disposition:** won't-support

### G-081 — ctx-bound is a frontend-only sixth state that auto-wire-status.ts does not model

**Found by:** C (1 pass) · **Severity:** minor · **Type:** design-gap
**Surfaces:** canvas:node-badge, connect-summary, settings-panel:inputs, validation-drawer
**Source findings:** C-025
**Evidence:** apps/frontend/src/features/workflow-builder/auto-wire-status.ts:17

`NodeInputProblem.status` has three members and `computeNodeInputIssues` calls the 5-state resolver directly, so a ctx-bound port comes back `unsatisfied` and is only rescued downstream by an independently-implemented `manuallyBoundPorts` filter in auto-wire-validation.ts:27. Re-verified: `computeNodeStatus`, the unfiltered aggregate that would misreport a fully-bound node, has NO production caller (only auto-wire-status.test.ts), so there is no wrong pixel today. Downgraded to minor for that reason - the gap is that one concept has two implementations and one of them is unreachable dead code, which is a drift trap rather than a live defect.

**Proposed disposition:** fix

**RULING (2026-07-27): fix — SHIPPED `467d7405`.** Closed by DELETING `computeNodeStatus` rather than reconciling it. It had no production caller and disagreed with the reachable implementation about a ctx-bound port, so it was a drift trap waiting for someone to call it. Its tests now assert the same behaviour through `computeNodeInputIssues`.

**Merge note:** Pass C re-verified that `computeNodeStatus`, the unfiltered aggregate that would misreport a fully-bound node, has **no production caller** — so there is no wrong pixel today. This is a drift trap (one concept, two implementations, one unreachable), not a live defect.

### G-082 — J2.5 — no export of any kind exists on any run surface

**Found by:** A (1 pass) · **Severity:** minor · **Type:** design-gap
**Surfaces:** run-history-drawer, run-history-filters, run-row
**Source findings:** A-009
**Evidence:** apps/frontend/src/features/workflow-builder/run-history/RunHistoryDrawer.tsx:1

SPECULATIVE REQUIREMENT: the brief flags J2 step 5 as inferred rather than observed. Confirmed as a wall — `RunHistoryDrawer` renders an infinite-scroll list with a filter row and a Replay button and nothing else; there is no download, copy-all, or CSV affordance in `run-history-drawer`, `run-row`, or `run-history-filters`. Ranking this minor and deferring: the wall is real but downstream of A-006 and A-008 — without a batch and without a retained per-document reason there is nothing to export yet.

**Proposed disposition:** defer

**Merge note:** Pass A flags this as a SPECULATIVE REQUIREMENT (inferred, not observed) and ranks it accordingly.

### G-083 — J6.4 — a workflow declares what it expects but not what it produces; `run-spec` has an inputSchema and no output contract

**Found by:** A (1 pass) · **Severity:** minor · **Type:** design-gap
**Surfaces:** library-port-editor, run-drawer, workflow-settings
**Source findings:** A-028
**Evidence:** apps/backend-services/src/workflow/build-run-spec.ts:15

`RunSpec` is `{triggerUrl, inputSchema, authNotes, sampleCurl}` (+ optional `uploadSpec`). Only library workflows declare outputs, via `metadata.outputs` / `LibraryPortDescriptor`. So the first half of J6 step 4 is served (Run drawer shows the declared input schema) and the second half — "what it produces at the end" — is not, unless someone saved the workflow as a library. Minor because Sam can infer it from the terminal nodes' output bindings; deferring pending a decision on whether non-library workflows should carry an output contract at all.

**Proposed disposition:** defer

### G-084 — J6.2 — a nested branch condition is unreadable from the canvas: it collapses to `all of (2)` and only the settings form shows the predicate

**Found by:** A (1 pass) · **Severity:** minor · **Type:** design-gap
**Surfaces:** canvas:edge-label, condition-editor, settings-panel:switch
**Source findings:** A-029
**Evidence:** apps/frontend/src/features/workflow-builder/canvas/edge-labels.ts:72

Flat comparisons humanise well (`is`, `is not`, `contains`, `≥` — edge-labels.ts:38–46), which meets J6 step 2 for simple cases. Anything with an `and`/`or` renders `all of (N)` / `any of (N)`, so Sam must open the switch's settings form and expand the tree to read it — and the master template's `segmentRouter` is exactly that shape. Deferring: a tooltip carrying the expanded predicate would close this cheaply and it is not on the critical path of any journey.

**Proposed disposition:** defer

### G-085 — J7.8 — no partial re-run: every re-execution is a whole-graph run from the entry node, and it becomes an official run in history

**Found by:** A (1 pass) · **Severity:** minor · **Type:** design-gap
**Surfaces:** cache-evicted-alert, run-drawer, run-history-drawer
**Source findings:** A-037
**Evidence:** apps/backend-services/src/workflow/dto/start-run.dto.ts:21

SPECULATIVE REQUIREMENT: the brief flags J7 step 8 as inferred. Confirmed as a wall — `StartRunRequestDto` takes `initialCtx` + `workflowVersionId` only; there is no start-node, node-subset, or dry-run field, and every run lands in run history with no marking. The activity-output cache does give a *partial* answer in practice (test-plan 9.6: unchanged upstream nodes come back `skipped` from cache, so only the suspect node and its downstream re-execute), but the run is still full-graph and still official. Ranking minor and deferring per the brief's instruction to rank speculative requirements lower.

**Proposed disposition:** defer

**Merge note:** Pass A flags this as a SPECULATIVE REQUIREMENT and notes it deserves a second look: the activity-output cache already delivers most of what the step asks for (unchanged upstream nodes come back `skipped`); what is missing is only the "not a second official result" half.

### G-086 — No align / distribute / snap for hand-placed nodes; the only layout tool rewrites every position at once

**Found by:** B (1 pass) · **Severity:** minor · **Type:** design-gap
**Surfaces:** auto-arrange, canvas, topbar:more-menu
**Source findings:** B-008
**Evidence:** apps/frontend/src/features/workflow-builder/canvas/auto-layout.ts:239

Layout is all-or-nothing: `handleAutoArrange` (`WorkflowEditorV2Page.tsx:389`) calls `layoutGraphWithMapBodies` (cited line), a dagre pass that stamps a fresh `metadata.position` on EVERY node; `<ReactFlow>` sets no `snapToGrid`/`snapGrid` (`WorkflowEditorCanvas.tsx:3050`–`:3079`), and there is no align-left/distribute-horizontally action on any surface. So a user who has hand-tuned a sub-region either tidies it pixel-by-pixel or loses the whole arrangement to dagre — which, with B-001 unfixed, is itself an unundoable destructive action from a single menu click. Deferred rather than fixed because auto-arrange plus free drag is a defensible minimum for graphs of this size, and the sharper edge here (auto-arrange being irreversible) is subsumed by B-001.

**Proposed disposition:** defer

### G-087 — An edge's type cannot be changed after it is drawn

**Found by:** B (1 pass) · **Severity:** minor · **Type:** design-gap
**Surfaces:** canvas:edge-label, canvas:wire, wire-menu
**Source findings:** B-013
**Evidence:** apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx:2693

`GraphEdge.type` is decided once, at connect time, from the source node type and source handle id (cited block: switch source → `conditional`, `sourceHandle === 'error'` → `error`, else `normal`) and is never editable afterwards. `WireContextMenu` offers View data / Revert to automatic / Disconnect and opens only for data wires — structural wires 'keep the browser's native context menu' (`WorkflowEditorCanvas.tsx:2430`), so a conditional or error edge has no menu at all. Converting a normal edge to an error edge therefore means deleting it and redrawing from the error handle, which B-009 makes impossible anyway. Deferred: with B-009 fixed, the retype case becomes rare enough that delete-and-redraw is acceptable; without it, this is a symptom rather than the disease.

**Proposed disposition:** defer

### G-088 — Real-time collaborative editing (presence, live cursors, operational merge) is out of scope

**Found by:** B (1 pass) · **Severity:** minor · **Type:** non-goal
**Surfaces:** canvas, page-shell, version-history
**Source findings:** B-022
**Evidence:** apps/backend-services/src/workflow/workflow.service.ts:778

Recorded deliberately so it stops being rediscovered as a hole. The persistence model is an append-only chain of immutable, whole-config versions (cited `tx.workflowVersion.create` writing the entire `config` as one JSON blob, head repointed at `:785`–`:788`). Multi-user live editing would require per-field operations, a merge strategy and a presence channel — a different persistence model, not a missing feature. Nothing in the roster's item 11 obliges a workflow authoring tool at this stage to be Figma. What IS obligatory from item 11, and is a genuine gap, is detecting the lost update rather than preventing it — filed separately as B-021. Distinguishing the two matters: B-021 is a small, cheap fix; this is a rewrite, and choosing not to do it should be a recorded decision.

**Proposed disposition:** won't-support

### G-089 — Temporal Terminated / TimedOut / ContinuedAsNew deliberately collapse to `failed` in run history and are not separately filterable

**Found by:** C (1 pass) · **Severity:** minor · **Type:** non-goal
**Surfaces:** run-history-filters, run-history:query, run-row
**Source findings:** C-051
**Evidence:** apps/backend-services/src/workflow/workflow.controller.ts:1550

`mapTemporalStatusToDtoStatus` maps `Unknown` → `failed` with a comment stating the intent ('so the row still renders with a sensible badge instead of being silently dropped'), and `RunSummaryStatus` is a deliberate 4-member narrowing of the 6-member node union. `pending` and `skipped` are node-level concepts with no run-level meaning. Recording the whole (run-status × run-history) narrowing as one decision.

**Proposed disposition:** won't-support

### G-090 — The full severity × anchor cross-product is not a design target — severity belongs to the rule, not the path

**Found by:** C (1 pass) · **Severity:** minor · **Type:** non-goal
**Surfaces:** topbar:validation-button, validation-drawer, validation-engine
**Source findings:** C-067
**Evidence:** packages/graph-workflow/src/types.ts:423

Only 6 of the 32 anchor shapes ever carry `warning` (`metadata.ctx`, `nodes.<id>` reachability, `nodes.<id>` multi-group, `nodes.<id>.inputs.<port>` from auto-wire, `nodes.<mapId>.bodyExitNodeId` from map-body analysis) and every other shape is error-only. Grading the same anchor at two severities would be meaningless — a dangling `defaultEdge` cannot be 'a bit wrong'. Recording that the ~52 empty cells of the 64-cell grid are structurally empty, not overlooked, so no future pass tries to fill them.

**Proposed disposition:** won't-support

### G-091 — A selected group chip is deletable but deleting it is a silent no-op, and `activeGroupId` is never cleared when its group is deleted

**Found by:** D (1 pass) · **Severity:** minor · **Type:** design-gap
**Surfaces:** canvas, canvas:group-chip, settings-panel:group
**Source findings:** D-031
**Evidence:** apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx:1532

D59/D60. Chips are projected with `draggable: false` but no `deletable: false`, and `deleteKeyCode` is armed, so selecting a chip in simplified view and pressing Delete calls `handleDelete` with the synthetic id `group-chip-<id>`, which `removeNodesFromConfig` finds in no node map, edge list or group membership — nothing happens and nothing explains why. Neither reasonable interpretation (delete the group, delete its members) is offered or refused. Separately, `deleteGroup` never clears `activeGroupId`, so the right rail falls through to a 'Group not found. It may have been deleted or renamed.' placeholder rather than closing.


**VERIFIED 2026-07-27: still true, both halves.** Chips are still projected `draggable: false` with no `deletable: false`, and `deleteGroup` still writes only `nodeGroups` — nothing clears `activeGroupId`.

**Proposed disposition:** fix

**RULING (2026-07-27): fix — SHIPPED `4544ab19`.** Both halves. The chip's Delete is refused with the working affordance named, rather than guessed at — deleting a group is not the same act as deleting the steps inside it. And `activeGroupId` is cleared on derived state rather than inside `deleteGroup`, so it holds for every path that can remove a group: the panel, an undo, an agent write, or a group emptied by `pruneNodesFromGroups`.

### G-092 — J2.6 — removing failed documents is not reachable from any Parts 3–9 surface

**Found by:** A (1 pass) · **Severity:** minor · **Type:** non-goal
**Surfaces:** page-shell, run-history-drawer
**Source findings:** A-012
**Evidence:** The workflow-builder editor (`/workflows/:id/edit`) exposes palette, canvas, settings panel, validation drawer, run drawer, run-history drawer and version history. None list documents or offer a delete. Document lifecycle lives in the documents module, outside the Parts 3–9 scope this pass covers.

Recording deliberately so it stops being rediscovered: the builder is a workflow-authoring surface and does not own document records. Marcus's step 6 is a real product requirement but belongs to the documents module, not to Parts 3–9. Flagging for the merge so it is routed rather than dropped.

**Proposed disposition:** won't-support

**RULED 2026-07-26 — ROUTED, not dropped.** Correct as won't-support *for the builder* — removing failed documents belongs to the documents module — but it is a real requirement from J2 step 6, and "won't-support" reads as "no". To be raised against the documents module so it is not silently lost.

### G-093 — J3.4 — routing the unmatched section works, and reads correctly on the canvas

**Found by:** A (1 pass) · **Severity:** minor · **Type:** non-goal
**Surfaces:** canvas:edge-label, settings-panel:switch
**Source findings:** A-015
**Evidence:** apps/temporal/src/activities/split-and-classify-document.ts:221

Recorded as a deliberate PASS so the merge does not treat J3 step 4 as an open gap. `splitAndClassify` emits `segmentType: "unknown"` for unmatched ranges (and a whole-document `unknown` segment when no marker matches at all), a switch default edge exists, and the edge renders as `otherwise` (edge-labels). The gap in this journey is A-014's dead-end drop, not the unmatched-label handling itself.

**Proposed disposition:** won't-support

**Merge note:** Records a behaviour that **works**, so that J3 step 4 does not read as unexplored at the disposition gate. Not a gap; kept in the register for traceability.

**RULED 2026-07-26 — CLOSED, not a gap.** This entry records a PASS: routing an unmatched section works and reads correctly on the canvas. Keeping it in a gap register overstates the backlog.

### G-094 — J6.7 — "what changed" is answered with two raw JSON blobs side by side, not a structural diff

**Found by:** A (1 pass) · **Severity:** minor · **Type:** non-goal
**Surfaces:** compare-to-head, version-history
**Source findings:** A-030
**Evidence:** docs-md/workflow-builder/MANUAL_TEST_PLAN.md:425

Test-plan 12.3 states "modal with two read-only JSON blocks side-by-side (`v{n}` vs `head`); no structural diff (by design)". Recording it as a deliberate decision so it stops being rediscovered. Sam's step 7 ("verify the change is what was intended by comparing against how it was before") is technically answerable by eye on a one-line change, and `version-history` Revert covers "know how to get back if it was wrong" cleanly.

**Proposed disposition:** won't-support

**RULED 2026-07-26 — WON'T-SUPPORT, as proposed.** Same underlying fact as G-079; the two describe one decision from different journeys.

### G-095 — getAggregateStatus returns only 4 of 6 statuses — an all-cache-hit group reads succeeded, cancelled members read pending

**Found by:** C (1 pass) · **Severity:** minor · **Type:** design-gap
**Surfaces:** canvas:group-chip, run-status-badge
**Source findings:** C-048
**Evidence:** apps/frontend/src/features/workflow-builder/run/RunStateContext.tsx:182

`allTerminalSucceededOrSkipped` folds `skipped` into `succeeded`, so a group every member of which was served from cache shows the green check rather than the violet lightning bolt that individually-rendered members would show. `cancelled` falls through to `pending`. Collapsing a group therefore loses two of the six statuses — the (skipped × group-chip) and (cancelled × group-chip) cells are unspecified.


**VERIFIED 2026-07-27: still true, and now slightly wider.** `allTerminalSucceededOrSkipped` still folds `skipped` into `succeeded`. Since G-047 made `cancelled` a real `NodeRunStatusValue`, the `cancelled → pending` collapse is now reachable rather than hypothetical.

**Proposed disposition:** fix

**RULING (2026-07-27): fix — SHIPPED `4544ab19`.** `getAggregateStatus` now returns all six statuses. Both missing cells already had a badge treatment, so nothing new had to be drawn — the information was being discarded, not unrepresentable.

### G-096 — nodeIdFromPath splits at the first dot while parseInputPortPath is greedy — a dotted node id buckets under a non-existent node

**Found by:** C (1 pass) · **Severity:** minor · **Type:** impl-gap
**Surfaces:** canvas:node-badge, validation-drawer
**Source findings:** C-066
**Evidence:** apps/frontend/src/features/workflow-builder/validation/useGraphValidation.ts:119

`rest.slice(0, rest.indexOf("."))` vs `/^nodes\.(.+)\.inputs\./`. Node ids are author/agent-supplied strings with no charset rule in the validator, so an id containing a dot produces a bucket key that matches no node: the drawer heading falls back to the raw key, `config.nodes[nodeId]` is undefined, and clicking selects nothing. Deferred because it needs an id-charset decision first, which is not this pass's call.

**Proposed disposition:** defer

**RULED 2026-07-26 — FIXED** (`514a0896`). Anchors now resolve against the graph's real node ids, longest match first.

### G-097 — topbar:validation-button reports errors+warnings as one red "N issues" count

**Found by:** C (1 pass) · **Severity:** minor · **Type:** design-gap
**Surfaces:** topbar:validation-button, validation-drawer
**Source findings:** C-069
**Evidence:** apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx:1440

`total = errorCount + warningCount` is used for the label whenever `errorCount > 0`, so 1 error plus 5 warnings reads '6 issues' in red — the severity split is only recoverable by opening the drawer. The per-node buckets and the node badge both keep the two counts separate, so the top bar is the one surface that erases the severity axis it summarises.

**Proposed disposition:** defer

**RULED 2026-07-26 — FIXED** (`514a0896`). `validationButtonState` keeps errors and warnings apart.

### G-098 — Ctx declarations are never garbage-collected — implicitly created keys and keys orphaned by node deletion accumulate silently

**Found by:** D (1 pass) · **Severity:** minor · **Type:** design-gap
**Surfaces:** variable-picker, workflow-settings
**Source findings:** D-017
**Evidence:** apps/frontend/src/features/workflow-builder/graph-widgets/ctx-declaration.ts:21

D105. `declareCtxKey` is called from five settings surfaces via the VariablePicker's '+ Create variable' affordance and writes `{type:"object"}`; nothing anywhere removes a `config.ctx` entry except the drawer's manual trash icon. Removing the binding that motivated the key, or deleting the node that produced it, leaves the declaration behind, and an inert `object` declaration is invisible to the validator. Harmless in isolation, but it accumulates in every saved version and any such key later marked `isInput` leaks into the public run-spec. Deferrable because the failure mode is clutter, not incorrect execution — but it should be recorded rather than rediscovered.

**Proposed disposition:** defer

**RULED 2026-07-26 — SHIPPED.** Both halves are addressed. `removeNodesFromConfig` prunes orphaned ctx declarations unconditionally at the single choke point every delete path funnels through (`findOrphanedCtxKeys` + `pruneCtxDeclarations`), with an author prompt via `describeOrphanedDelete`; and `WorkflowSettingsDrawer` renders `Used by {n}` plus an explicit "declared but unused" row at zero.

### G-099 — Removing a key from an activity's `parametersSchema` leaves the saved value on the node forever, invisible and uneditable

**Found by:** D (1 pass) · **Severity:** minor · **Type:** design-gap
**Surfaces:** settings-panel:params, validation-engine
**Source findings:** D-023
**Evidence:** apps/frontend/src/features/workflow-builder/json-schema-form/JsonSchemaForm.tsx:135

D25. The form renders from `Object.entries(schema.properties)`, so a saved key with no property is never shown, and the write-back spreads the existing object and only touches the edited field, so the orphan survives every edit. No activity `parametersSchema` uses `.strict()`, so Zod strips the key during validation and reports nothing. The value is inert at run time (the activity ignores it) — hence minor — but it inflates the cache `configHash` input and makes two logically identical nodes hash differently, and there is no config-migration mechanism to clean it up (`SUPPORTED_SCHEMA_VERSIONS` has one member).

**Proposed disposition:** defer

**RULED 2026-07-26 — FIXED** (`1998f887`). Orphaned parameter values are named with an explicit removal action, rather than pruned silently.

### G-100 — join.strategy "any" (first-to-complete fan-in) is deliberately not supported

**Found by:** C (1 pass) · **Severity:** minor · **Type:** non-goal
**Surfaces:** settings-panel:join
**Source findings:** C-013
**Evidence:** packages/graph-workflow/src/types.ts:252

The type comment records the decision: the map eagerly awaits every branch, so there is nothing to race; `any` would require a different map executor. Writing it down here so the missing strategy select in JoinNodeSettings stops being rediscovered as a gap.

**Proposed disposition:** won't-support

### G-101 — ambiguous and unsatisfied deliberately carry no status badge in settings-panel:inputs

**Found by:** C (1 pass) · **Severity:** minor · **Type:** non-goal
**Surfaces:** settings-panel:inputs
**Source findings:** C-030
**Evidence:** apps/frontend/src/features/workflow-builder/settings/InputsSection.tsx:294

Both branches set `primary` (a coloured CTA button) and leave `badge` null; `auto-bound`/`locked`/`locked-unbound` set `badge` and leave `primary` null. The badge column is for STATES, the CTA column is for ACTIONS — a row never needs both. Recording the asymmetry as intentional so the 'missing badge' cells stop being refiled.

**Proposed disposition:** won't-support

### G-102 — ctx-bound renders neither a badge nor a CTA — a satisfied state with no indicator

**Found by:** C (1 pass) · **Severity:** minor · **Type:** non-goal
**Surfaces:** settings-panel:inputs
**Source findings:** C-031
**Evidence:** apps/frontend/src/features/workflow-builder/settings/InputsSection.tsx:380

The branch sets only `middle` ('from <ctxKey>') plus a 'Change source' overflow item. It is the one satisfied state with no badge, which is deliberate: a hand-authored ctx binding is the author's own decision and needs no system annotation. Distinguishing it from `locked`-via-ctx (which DOES show 'Pinned') is the sole remaining wrinkle and is a labelling choice, not a gap.

**Proposed disposition:** won't-support

### G-103 — `cancelled` deliberately renders with the `pending` visual until the cancel UX lands

**Found by:** C (1 pass) · **Severity:** minor · **Type:** non-goal
**Surfaces:** run-status-badge
**Source findings:** C-050
**Evidence:** apps/frontend/src/features/workflow-builder/run/NodeStatusBadge.tsx:66

The style map aliases `cancelled` to gray/IconCircle with an explicit comment deferring to US-141. Not a drift: it is a decision to render something sensible rather than crash on a status the design surface never specified a colour for. Recorded so the (cancelled × run-status-badge) cell reads 'deliberate alias', not 'missing'.

**Proposed disposition:** won't-support

## Non-goals register

Every source finding whose pass proposed `won't-support`, with the reason it was recorded.
These are deliberate decisions being written down so they stop being rediscovered by the next
audit. They still need Alex's confirmation at the disposition gate — a `won't-support` proposed
by a pass is a recommendation, not a ruling.

### A-012 (G-092) — J2.6 — removing failed documents is not reachable from any Parts 3–9 surface

**Pass:** A · **Severity:** minor · **Surfaces:** page-shell, run-history-drawer

Recording deliberately so it stops being rediscovered: the builder is a workflow-authoring surface and does not own document records. Marcus's step 6 is a real product requirement but belongs to the documents module, not to Parts 3–9. Flagging for the merge so it is routed rather than dropped.

### A-015 (G-093) — J3.4 — routing the unmatched section works, and reads correctly on the canvas

**Pass:** A · **Severity:** minor · **Surfaces:** settings-panel:switch, canvas:edge-label

Recorded as a deliberate PASS so the merge does not treat J3 step 4 as an open gap. `splitAndClassify` emits `segmentType: "unknown"` for unmatched ranges (and a whole-document `unknown` segment when no marker matches at all), a switch default edge exists, and the edge renders as `otherwise` (edge-labels). The gap in this journey is A-014's dead-end drop, not the unmatched-label handling itself.

### A-030 (G-094) — J6.7 — "what changed" is answered with two raw JSON blobs side by side, not a structural diff

**Pass:** A · **Severity:** minor · **Surfaces:** compare-to-head, version-history

Test-plan 12.3 states "modal with two read-only JSON blocks side-by-side (`v{n}` vs `head`); no structural diff (by design)". Recording it as a deliberate decision so it stops being rediscovered. Sam's step 7 ("verify the change is what was intended by comparing against how it was before") is technically answerable by eye on a one-line change, and `version-history` Revert covers "know how to get back if it was wrong" cleanly.

### B-022 (G-088) — Real-time collaborative editing (presence, live cursors, operational merge) is out of scope

**Pass:** B · **Severity:** minor · **Surfaces:** page-shell, canvas, version-history

Recorded deliberately so it stops being rediscovered as a hole. The persistence model is an append-only chain of immutable, whole-config versions (cited `tx.workflowVersion.create` writing the entire `config` as one JSON blob, head repointed at `:785`–`:788`). Multi-user live editing would require per-field operations, a merge strategy and a presence channel — a different persistence model, not a missing feature. Nothing in the roster's item 11 obliges a workflow authoring tool at this stage to be Figma. What IS obligatory from item 11, and is a genuine gap, is detecting the lost update rather than preventing it — filed separately as B-021. Distinguishing the two matters: B-021 is a small, cheap fix; this is a rewrite, and choosing not to do it should be a recorded decision.

### B-025 (G-080) — Breakpoints, stepping, and mid-run intervention are out of scope for the editor

**Pass:** B · **Severity:** minor · **Surfaces:** run-state, run:polling, run-drawer, canvas:node-card

Recorded so roster item 8 is not read as demanding a step-debugger. Execution happens in Temporal, out of process; the editor observes it through a 1.5 s poll of a node-status endpoint (cited file; INVENTORY §2.7 `run:polling`) and a read-only output cache. A breakpoint would require the engine to offer suspend/resume at node granularity, which is an engine capability, not an editor one — and the product already has a first-class, designed mechanism for deliberate mid-run pausing: the `humanGate` node. Post-hoc inspection (previews, wire peek, run history, replay) is the right shape for this architecture. The genuine item-8 gaps are that the post-hoc view is incomplete — filed as B-016, B-017, B-018 and B-026 — not that stepping is missing.

### C-013 (G-100) — join.strategy "any" (first-to-complete fan-in) is deliberately not supported

**Pass:** C · **Severity:** minor · **Surfaces:** settings-panel:join

The type comment records the decision: the map eagerly awaits every branch, so there is nothing to race; `any` would require a different map executor. Writing it down here so the missing strategy select in JoinNodeSettings stops being rediscovered as a gap.

### C-014 (G-045) — The graph has no containment object — only map declares a body; switch/pollUntil/humanGate/join/childWorkflow do not nest

**Pass:** C · **Severity:** major · **Surfaces:** canvas, canvas:map-body-box, settings-panel:switch, settings-panel:poll-until

`bodyEntryNodeId`/`bodyExitNodeId` on `MapNode` is the model's ONLY scope marker; switch branches are plain edges, pollUntil repeats a single activity, humanGate/join are point nodes, and childWorkflow nests by embedding a separate config. Recording this as the non-goal it is: 'nesting' in Parts 3–9 means map bodies plus inline child graphs, nothing else. Everything the brief lists as a nesting combination therefore reduces to edge topology, which is why C-003/C-004 have nothing to check against.

### C-030 (G-101) — ambiguous and unsatisfied deliberately carry no status badge in settings-panel:inputs

**Pass:** C · **Severity:** minor · **Surfaces:** settings-panel:inputs

Both branches set `primary` (a coloured CTA button) and leave `badge` null; `auto-bound`/`locked`/`locked-unbound` set `badge` and leave `primary` null. The badge column is for STATES, the CTA column is for ACTIONS — a row never needs both. Recording the asymmetry as intentional so the 'missing badge' cells stop being refiled.

### C-031 (G-102) — ctx-bound renders neither a badge nor a CTA — a satisfied state with no indicator

**Pass:** C · **Severity:** minor · **Surfaces:** settings-panel:inputs

The branch sets only `middle` ('from <ctxKey>') plus a 'Change source' overflow item. It is the one satisfied state with no badge, which is deliberate: a hand-authored ctx binding is the author's own decision and needs no system annotation. Distinguishing it from `locked`-via-ctx (which DOES show 'Pinned') is the sole remaining wrinkle and is a labelling choice, not a gap.

### C-050 (G-103) — `cancelled` deliberately renders with the `pending` visual until the cancel UX lands

**Pass:** C · **Severity:** minor · **Surfaces:** run-status-badge

The style map aliases `cancelled` to gray/IconCircle with an explicit comment deferring to US-141. Not a drift: it is a decision to render something sensible rather than crash on a status the design surface never specified a colour for. Recorded so the (cancelled × run-status-badge) cell reads 'deliberate alias', not 'missing'.

### C-051 (G-089) — Temporal Terminated / TimedOut / ContinuedAsNew deliberately collapse to `failed` in run history and are not separately filterable

**Pass:** C · **Severity:** minor · **Surfaces:** run-row, run-history-filters, run-history:query

`mapTemporalStatusToDtoStatus` maps `Unknown` → `failed` with a comment stating the intent ('so the row still renders with a sensible badge instead of being silently dropped'), and `RunSummaryStatus` is a deliberate 4-member narrowing of the 6-member node union. `pending` and `skipped` are node-level concepts with no run-level meaning. Recording the whole (run-status × run-history) narrowing as one decision.

### C-067 (G-090) — The full severity × anchor cross-product is not a design target — severity belongs to the rule, not the path

**Pass:** C · **Severity:** minor · **Surfaces:** validation-engine, validation-drawer, topbar:validation-button

Only 6 of the 32 anchor shapes ever carry `warning` (`metadata.ctx`, `nodes.<id>` reachability, `nodes.<id>` multi-group, `nodes.<id>.inputs.<port>` from auto-wire, `nodes.<mapId>.bodyExitNodeId` from map-body analysis) and every other shape is error-only. Grading the same anchor at two severities would be meaningless — a dangling `defaultEdge` cannot be 'a bit wrong'. Recording that the ~52 empty cells of the 64-cell grid are structurally empty, not overlooked, so no future pass tries to fill them.

Two entries above are unusual in kind and worth calling out. **C-014** is not a missing feature at all:
it records that the graph model has exactly *one* containment object (`MapNode.bodyEntryNodeId`/
`bodyExitNodeId`, plus `childWorkflow`'s embedded `inline.graph`), which is why several of the nesting
combinations the briefs named have nothing to check against. **A-015** records a journey step that
**works**, so that J3 step 4 does not read as unexplored. Neither is a gap; both are here so the next
audit does not refile them.

---

## Found during remediation

Defects the fix batches surfaced that were **not** in the original four discovery passes and
therefore have no entry above. They are recorded here so the effort does not lose what it
learned. Unless an entry says otherwise they are recommendations awaiting Alex's ruling,
exactly like a pass-proposed disposition. G-104 has since been fixed (batch 10) and carries an
Outcome block; G-106 was found while fixing it.

Ids continue the register's sequence (the merged findings run to G-103).

**RULED 2026-07-26 — DEFER, not won't-support.** The entry's own note defers to US-141 (the cancel UX). It is a park with an owner, not a permanent non-goal; relabelled so it is revisited when that lands.

### G-104 — Map-item wires can never render: the resolver names a map's item producer by `itemCtxKey` while `nodeTypeCtxWrites` names it by the port `"item"`

**Found by:** batch 4 (remediation) · **Severity:** major · **Type:** impl-gap
**Surfaces:** canvas, canvas:port-rows, auto-wire, settings-panel:inputs
**Evidence:** `packages/graph-workflow/src/auto-wire/ctx-source.ts` (`nodeTypeCtxWrites`, `case "map"` → `port: "item"`) · `packages/graph-workflow/src/auto-wire/resolver.ts` (map-item pass) · `apps/frontend/src/features/workflow-builder/canvas/derive-wires.ts`

The two halves of the same lookup disagree about what a map's item port is called. The
auto-wire resolver identifies a map's per-item producer by the map's **`itemCtxKey`**
(`resolver.ts` special-cases `producerNode?.type === "map"` for exactly this reason); the shared
write enumeration `nodeTypeCtxWrites` records that same write under the **port name `"item"`**.
A wire derived for a map item would therefore carry a `sourcePort` its own provenance lookup
could never match, so `derive-wires.ts` **skips `map` entirely** when building the producer
index — and a body node correctly auto-bound to the map's item gets **no wire at all**: a
binding the author can neither see nor delete. The exclusion is documented in a comment at
`derive-wires.ts`, which is how it was found.

This is **pre-existing**, adjacent to G-007 (control-flow nodes having no declared output
ports), and was deliberately **not fixed in batch 4**: the batch's scope was the declared-port
enumeration itself, and reconciling the two naming schemes touches the resolver, the wire
derivation and every persisted `outputs[]` row that already uses one convention.

It matters more than its lateness suggests: fan-out over a collection is the most common
binding shape in the product (every multi-page document workflow is a map), so the one binding
an author is most likely to create is the one whose wire cannot draw. **It probably warrants
its own batch** rather than being folded into a mixed one — a rename on either side is a data
migration over saved configs, not a local edit.

**Proposed disposition:** fix — own batch

**Outcome: FIXED in fix batch 10.** The resolver now reports a map's item producer under the
stable port name `"item"` (`resolve-input-port.ts`), `map` is indexed like every other
control-flow producer (`derive-wires.ts`), and the pin path binds to the key the producer
actually writes (`wire-mutations.ts`). Plan:
[docs/superpowers/plans/2026-07-25-fix-batch-10-map-item-wires.md](../../docs/superpowers/plans/2026-07-25-fix-batch-10-map-item-wires.md).

Two claims in the text above were **measured and found false** — recorded so the next reader
does not inherit the overestimate:

- **There is no data migration.** 0 of 2 map nodes in the shipped templates and 0 of 2 in the
  seeded database persist an `outputs[]` row (verified by sweeping all 15 templates and every
  seeded workflow). Maps write ctx through the dedicated `itemCtxKey` field, so the port name
  is an in-memory convention only. Nothing on disk encodes it, and the fix is a local edit.
- **`MapBodyContainer` is not a complication.** It is a pure presentational backdrop
  (`pointerEvents: "none"`, ~7% alpha fill) rendered *behind* the body nodes, which are
  ordinary siblings rather than children. A map→body wire is an ordinary wire and is fully
  legible through the box.

Two further things the batch established, neither of which blocks the fix:

- **`pinPortBinding` had the same bug on the write side, for every control-flow producer**, not
  only map: it computed the pinned ctx key with `synthesiseCtxKey(nodeId, port)` unconditionally
  and stamped a matching `outputs[]` row, so pinning a map/join/humanGate/childWorkflow/source
  wire persisted a key no executor writes *and* made the dead key decode as healthy. Fixed in
  the same batch.
- **A persisted map-item binding always loads as "Pinned by you"**, because `normaliseLocks`
  locks every binding whose ctx key is not `__auto.*`-prefixed and a map's item key is always
  author-named. The wire draws either way; only the `via: "map-item"` provenance tooltip is
  reserved for a binding auto-wire creates live in the session. See G-106.

### G-106 — The upstream walk does not descend into a map's body, so a body node never sees the map as a producer

**Found by:** batch 10 (remediation) · **Severity:** major · **Type:** impl-gap
**Surfaces:** auto-wire, canvas, settings-panel:inputs
**Evidence:** `packages/graph-workflow/src/auto-wire/upstream-walk.ts` (pure `config.edges` BFS) · `docs-md/workflows/templates/multi-page-report-workflow.json` · seeded `seed-workflow-multi-page-report`

`upstreamNodesWithDistance` is a reverse BFS over `config.edges` only. A map connects to its
body through `bodyEntryNodeId` / `bodyExitNodeId`, **not** through an edge — so unless the
author also draws an explicit `map → bodyEntry` edge, the map is not upstream of any body node
and the resolver's `map-item` synthetic-producer pass can never fire for it.

Both maps that ship in the product have exactly this shape. In
`multi-page-report-workflow.json` the map `processSegments` reaches its body only via
`bodyEntryNodeId: "segmentRouter"`, and `segmentRouter` has no incoming edge at all; the body
node `passthrough` binds `currentSegment` by hand. Measured: `resolveInputPort(cfg,
"passthrough", { name: "currentSegment", kind: "Segment" })` returns `unsatisfied`, and the
upstream set for `passthrough` is `{monthlyReportOcr, payStubOcr, bankRecordOcr,
unknownDocOcr, segmentRouter}` — no map.

Consequence: inside a loop, auto-wire is effectively off. Every body node's item binding has to
be typed by hand, and because a hand-typed key is not `__auto.*`-prefixed, `normaliseLocks`
then pins it — so the port also loses the "Revert to automatic" recovery that would re-derive
it. G-104 makes these bindings **visible** (the wire now draws from the map, via the ctx-key
producer index, which does not depend on the upstream walk), but it does not make them
**automatic**.

The fix is not obviously "walk into the body": the map's body is a nested scope, and whether a
body node should see producers *outside* the map — and at what distance — is a design question
the auto-wire spec does not currently answer. Deliberately left undispositioned.

**Proposed disposition:** needs a ruling

---

**RULED 2026-07-25 — option A. FIXED.**

Alex ruled that a map's body is **inside the map's scope**: a body node inherits the map's whole
upstream view, with the map itself ranked nearest.

The argument was coherence rather than preference. Three subsystems already treat a body node as
inside the map — the canvas body box, the variable picker's scope (`analyzeMapBody`) and the
runtime. Auto-wire was the lone dissenter, and ruling A makes four surfaces agree instead of
three-against-one.

**Implementation:** `upstream-walk.ts` now treats `map ⇢ bodyEntryNodeId` as an edge for
reachability. Plain BFS then yields the ordering the ruling asks for at no extra cost — an
in-body producer outranks the map (a value produced inside the iteration is more local than the
item), and the map outranks anything outside the loop (so the item wins a same-kind tie instead
of turning every in-loop binding ambiguous). A hand-drawn `map → bodyEntry` edge is de-duplicated
against the implicit one, and a self-referential body is skipped so a map cannot become its own
predecessor.

**Blast radius:** additive. Auto-wire only fills *unbound* ports and never rewrites a
non-`__auto.` key (8.6), so every existing hand-authored binding is untouched — the master
template's wires still read "Pinned by you", correctly, because they are.

**Verified:** 8 new unit tests in `upstream-walk.test.ts` (1034 green in the package, 1694 in the
frontend), plus a browser check on the exact broken shape — `document.split → map` with the body
reached **only** by the *Body entry* setting and no map→body edge. The item wire now draws with
`data-provenance="auto:map-item"`, the tooltip *"Connected automatically — item from the loop"*,
Inputs reading `Segment metadata ← Run for each item AUTO`, and the binding resolving to
`currentSegment` — the map's own key, not a synthesised `__auto.<mapId>.item`.

**Note for the next reader:** neither shipped demo can demonstrate this. The part-4 demo has
nothing upstream of its map, and the master template's bindings are already hand-authored (so
correctly stay pinned). That is a fixture-coverage gap, not a code gap — see STACK.md.

### G-105 — A stale Vite dep cache silently serves a bundle missing the new exports, and the editor dies with `does not provide an export named …`

**Found by:** batches 2–8 (remediation, retrospectively) · **Severity:** major · **Type:** tooling/process
**Surfaces:** dev-environment, page-shell
**Evidence:** `apps/frontend/vite.config.ts:70-72` (`optimizeDeps.include: ["@ai-di/graph-workflow"]`) and `:79-86` (aliases the package to `packages/graph-workflow/src/index.browser.ts`) · `apps/frontend/node_modules/.vite`

**Symptom.** After adding an export to `packages/graph-workflow`'s browser entry
(`index.browser.ts`) and importing it from the editor, the running dev server keeps serving its
**pre-bundled** copy of the package. The page throws
`SyntaxError: The requested module '/node_modules/.vite/deps/…' does not provide an export named '<newExport>'`
at module-eval time, which happens **before** any React render — so the whole editor is blank,
not just the new feature. Nothing in the terminal reports an error; the HMR log looks normal.

**Root cause.** The package is aliased to **source** (`resolve.alias` → `src/index.browser.ts`)
but is also listed in **`optimizeDeps.include`**, which forces Vite to pre-bundle it into
`node_modules/.vite/deps`. The pre-bundle is keyed on the dependency graph, not on the aliased
source file's mtime, so editing the browser entry does not invalidate it.

**Fix.** Delete the dep cache and restart the dev server, then read the log for the ready
banner. Rebuild the package too if anything type-checks against `dist` (`tsc` does):

```bash
npm run -w packages/graph-workflow build   # for tsc / node consumers
rm -rf apps/frontend/node_modules/.vite    # the actual fix for the dev server
# restart the frontend dev server, then check its log
```

**Why it is being recorded as a finding.** This went unnoticed for **three batches** of this
effort. Each agent dutifully reported "no live browser check performed", so a green unit suite
plus a green type-check read as success while the editor was, in fact, dead in the browser the
whole time. The failure mode is invisible to every automated gate the repo has: Jest/Vitest
resolve the package from source, `tsc` resolves it from `dist`, and only the dev server uses
the pre-bundle. The mitigation is procedural (it is now a standing rule in the batch plans),
but **dropping `@ai-di/graph-workflow` from `optimizeDeps.include`** — it is aliased to source,
so it does not need pre-bundling — would remove the trap rather than documenting around it.
That change needs a check that it doesn't reintroduce whatever made someone add the include in
the first place, which is why it is recorded rather than done here.

**Proposed disposition:** fix — remove the trap, not just the rule
