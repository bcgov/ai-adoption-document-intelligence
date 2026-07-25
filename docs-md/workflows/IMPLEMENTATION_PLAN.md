# Visual Workflow Builder — Implementation Plan

**Status:** Active. Phase 1A complete; Phase 1B in progress — backend catalog adoption item 1 landed 2026-05-23.
**Owner:** Alex.
**Last updated:** 2026-05-23.

This is the rolling source of truth for what we're building, the architectural decisions, the phased work, and what's explicitly deferred. The companion document [NOTES.md](NOTES.md) captures the user-vision walking notes, designer-conversation outcomes, and research findings that informed the plan. The typed-I/O design — foundational for Phase 3 onward — lives in [TYPED_IO_DESIGN.md](TYPED_IO_DESIGN.md).

---

## 1. What we're building

A visual editor for the graph-workflow engine: drag nodes onto a canvas, connect them, configure them in a side panel, save, run. Replaces the JSON-in-CodeMirror editor (`WorkflowEditorPage.tsx`) for non-developer users; coexists with it during the transition. The designer produced a working Figma Make prototype using React Flow that we're using as the layout/interaction reference (palette, canvas, settings panel; click-to-add + hover-to-extend chains).

Companion design docs (already in repo, treat as canonical):
- [WORKFLOW_DESIGN_BRIEF.md](WORKFLOW_DESIGN_BRIEF.md) — overall builder experience
- [WORKFLOW_NODE_CATALOG.md](WORKFLOW_NODE_CATALOG.md) — every node and its settings-panel fields
- [WORKFLOW_NODE_IO_MODEL_DECISION.md](WORKFLOW_NODE_IO_MODEL_DECISION.md) — why single in / single out + blackboard

---

## 2. Where work lives

- **Branch:** `feature/visual-workflow-builder`, cut from `origin/AI-1192` (Dylan's shared-package consolidation, not yet merged to develop). Do not ping Dylan; we're working on top of his branch.
- **Shared package:** `packages/graph-workflow` (`@ai-di/graph-workflow`) — extended with a catalog of activity entries + per-activity Zod schemas alongside Dylan's existing types + validator.
- **Frontend:** `apps/frontend` — new pages, new components, new feature folder under `apps/frontend/src/features/workflow-builder/`.
- **Old JSON editor** at `WorkflowEditorPage.tsx` stays untouched.

When Dylan's `AI-1192` PR lands, we merge develop in. If conflicts, we resolve in our branch.

---

## 3. Locked architectural decisions

These were debated and resolved. Do not re-litigate.

### 3.1 I/O model: single in / single out + blackboard context

Settled in [WORKFLOW_NODE_IO_MODEL_DECISION.md](WORKFLOW_NODE_IO_MODEL_DECISION.md) (Model A). Activity nodes render with one input handle and one output handle. Data flows through the shared `ctx` blackboard, not through wires. The three exceptions are *node features*, not user-drawn typed ports:

- **Switch** — N + 1 outgoing edges (one per case + default), schema-encoded
- **Error fallback** — additional outgoing edge of `type: "error"`, enabled when `errorPolicy.onError === "fallback"`
- **HumanGate timeout-fallback** — additional outgoing edge enabled when `onTimeout === "fallback"`

### 3.2 One distinct palette entry per activity type

Not a single generic "Activity" node with a dropdown. Each activity gets its own palette entry, own icon/colour, own settings form. Same visual *shape* (rounded rectangle for activities); only the palette entry, icon, color, and side-panel form differ. The designer agreed in a design review; design brief §11 argues for it.

### 3.3 Auto-discovered variables; keep current `ctx` declarations

`ctx: Record<string, CtxDeclaration>` stays as the workflow-level variable declaration mechanism. It is **not** replaced by a fully-implicit auto-discovery system. The editor surfaces ctx declarations in a polished "Workflow settings" drawer (workflow name, description, version, tags, ctx, entry node), but the underlying model is the same.

In addition, the variable pickers in node input slots **autocomplete from the union of ctx declarations + upstream node outputs**, so users don't manually maintain anything beyond what's needed.

What's dropped from the designer's prototype: the separate floating `ContextVariablesPanel` modal. Its content moves into the workflow-settings drawer.

### 3.4 Routes coexist

New visual editor at `/workflows/:id/edit-v2` (and `/workflows/create-v2`). Old JSON editor stays at `/workflows/:id/edit`. Workflow list page gets a second "Edit (visual)" link/button.

### 3.5 Layout flavor

The designer's V2 three-column layout: **left node palette → centre canvas → right node-settings panel**. With V1's click-to-add-from-existing-node + hover-to-extend menu (the preferred interaction, agreed in a design review). Drag-from-palette also supported as an alternative.

### 3.6 Node groups / simplified view stay

`nodeGroups` is in the schema, the existing `GraphVisualization.tsx` already renders the simplified-view collapsing for it ([apps/frontend/src/components/workflow/GraphVisualization.tsx:285](../../apps/frontend/src/components/workflow/GraphVisualization.tsx#L285)), and templates use it. Editing UI for groups (lasso-select → group → set label/color/icon → expose params) is in Phase 1B.

### 3.7 Schema-driven settings forms (one source of truth)

Each activity in the catalog declares a **Zod v4 schema** for its static parameters. The schema is the single source of truth:

- **Backend / Temporal:** parameter validation at save time / execute time via `z.parse()`.
- **Frontend:** parameter form rendering via `z.toJSONSchema()` + a custom ~300-LOC Mantine renderer that walks JSON Schema. UI hints (widget type, picker source, default, options) ride along through Zod's `.meta({ ... })` as JSON Schema `x-*` extension fields.
- **Future LLM tool-calling consumers:** consume the JSON Schema directly.

Authoring is in Zod for TS ergonomics + type inference; runtime artifact is JSON Schema for portability + tooling compatibility. The renderer doesn't depend on Zod.

Existing partial implementations being replaced:
- Backend `activity-parameter-schema-registry.ts` (1 entry, imperative validators) → consumed via catalog instead
- Frontend `AzureClassifySubmitForm.tsx`, `SelectClassifiedPagesForm.tsx`, `FlattenClassifiedDocumentsForm.tsx` (3 entries, hand-rolled forms) → become hand-rolled overrides only where the generic renderer can't express the widget (e.g., classifier dropdown needs an API call)

### 3.8 Zod 4 via the `zod/v4` bridge import

Repo currently uses Zod 3.25.76 (the bridge release that exposes both v3 and v4 APIs via subpaths). New workflow-builder code imports `from "zod/v4"`. Existing v3 callers (`apps/frontend/src/features/tables/`) keep `from "zod"` unchanged. `z.toJSONSchema()` is available natively in v4. `z.globalRegistry` / `.meta()` available for UI metadata.

### 3.9 `mantine-form-zod-resolver` is legacy

`@mantine/form` v8.2+ has built-in `schemaResolver` for Standard-Schema-compliant libraries (Zod, valibot, arktype). New workflow-builder forms use `schemaResolver`. Existing `mantine-form-zod-resolver` callers (`apps/frontend/src/features/tables/`) keep their current pattern.

### 3.10 Everything UI-related lives in the shared `@ai-di/graph-workflow` package

Not a sibling package. Activity catalog (display name, category, icon hint, colour hint, port descriptors, Zod schema) lives next to the types + validator. Backend imports it for validation; frontend imports it for palette + settings rendering. One source of truth.

---

## 4. Phase dependencies

The phases form a small DAG, not a strict line. The previous version of this doc numbered phases linearly and that hid two load-bearing dependencies — typed I/O sits *before* segmentation (not after), and library workflows + workflow-as-API are foundations for try-in-place + AI agent (not "Phase 8+" polish).

```
                Phase 1A (editor foundation — DONE)
                            │
                            ▼
                Phase 1B (editor completion + backend catalog adoption)
                            │
                            ▼
                Phase 2 (library workflows + workflow-as-API + versioning)
                            │
                            ▼
                Phase 3 (typed I/O artifacts)
                            │
              ┌─────────────┼─────────────┬─────────────┐
              ▼             ▼             ▼             ▼
          Phase 4       Phase 5         Phase 6      Phase 8
       (try-in-place  (segmentation   (dynamic       (sources —
        + caching +    node pack)      nodes —        document
        per-node                       Windmill-      intake as
        previews)                      style)         nodes)
              │             │             │             │
              └─────────────┴──────┬──────┴─────────────┘
                                   ▼
                          Phase 7 (AI workflow builder)
```

**Why this ordering:**

- **Phase 2 before 3.** `childWorkflow` nodes need typed signatures to be useful in Phase 3; library workflows declare those signatures. Doing typed I/O first means typed handles have nothing to point at except activities.
- **Phase 3 before 5.** Segmentation produces `Segment[]` artifacts. Without a registered `Segment` type, those are opaque blobs in ctx and the user gets no design-time enforcement that "this segment goes into a table-extraction VLM, that one into a signature classifier."
- **Phase 4 parallelisable with 5 + 6 + 8.** Try-in-place needs Phase 3's typed handles to render type-specific previews (a `Segment<Table>` preview ≠ an `OcrFields` preview), but doesn't depend on 5, 6, or 8.
- **Phase 8 parallelisable with 4, 5, 6.** Sources emit `Document` artifacts, so they want Phase 3's typed handles — but otherwise they're independent of the other three. A `source.upload` node also naturally absorbs Phase 4's canvas-side "Input" affordance, so landing 8 before 4 lets that affordance plug into a unified abstraction instead of being a one-off widget. Either ordering works; bias toward 8 first if you're picking.
- **Phase 7 depends on 2, 3, 6, and 8.** The agent reads library workflows (Phase 2), composes by type (Phase 3), authors novel work via dynamic nodes (Phase 6), and now also wires source nodes (Phase 8) — sources expand the agent's composition surface from "what does this workflow do given input X" to "where does input X come from."

The previous "Phase 8+" bucket (workflow-as-API, library workflows, versioning) is dissolved — each item moved into the phase that needs it. The new "Phase 8" reuses the slot but for a different concept (document sources); see [Phase 8 below](#phase-8--sources-document-intake-as-nodes).

---

## 5. Phased plan

### Phase 1A — Editor foundation (DONE, 2026-05-23)

Shipped on `feature/visual-workflow-builder`, 32 commits ahead of `origin/AI-1192`. What landed:

- [x] Cut feature branch off `origin/AI-1192`
- [x] Zod v4 catalog scaffolding in `packages/graph-workflow`
- [x] **All 41 currently-registered activity types** have catalog entries (one `{...}.ts` per type under `packages/graph-workflow/src/catalog/activities/`; 158 catalog tests green including the round-trip pin for `document.validateFields`)
- [x] Frontend Mantine JSON Schema form renderer — handles string / number / integer / boolean / enum / combobox / discriminated unions / arrays of primitives & simple objects; respects `x-widget`, `x-options`, `x-default`, `description`, `x-step`, `x-options-labels`
- [x] `WorkflowEditorV2Page.tsx` at `/workflows/:id/edit-v2` and `/workflows/create-v2`; three-column layout
- [x] Interactive xyflow canvas (`WorkflowEditorCanvas.tsx` — a sibling of the existing read-only `GraphVisualization.tsx`, not a fork of it): per-type shapes for activity / switch (diamond) / map / join / childWorkflow / pollUntil / humanGate; selection / drag / connect / delete; positions persist into `metadata.position`
- [x] Left palette driven by the catalog, categorised, with `/` search; plus a Flow Control section for the 6 control-flow node types (US-011)
- [x] Right node-settings panel — schema-driven for activities; hand-rolled per-type for the 6 control-flow node types (US-004 → US-010); 3 reusable graph-aware primitives (`NodePicker`, `EdgePicker`, `ConditionExpressionEditor`, US-001 → US-003)
- [x] Variable pickers in node input slots (`VariablePicker`) autocomplete from ctx + upstream outputs
- [x] Workflow settings drawer (name / description / version / tags / ctx / entry node)
- [x] Validation surfacing (debounced, red node badges, click-through drawer, US-013)
- [x] Save / load round-trip via `useCreateWorkflow` / `useUpdateWorkflow`. Verified end-to-end on `multi-page-report-workflow.json` via Playwright: 16 nodes / 17 edges / 5 nodeGroups / 17 ctx declarations preserve byte-for-byte
- [x] Templates picker (static bundle of `docs-md/graph-workflows/templates/*.json`) on the workflow-list page
- [x] Auto-fit-on-add (US-014, 2026-05-23) — palette adds animate the new node into view

**Approach decisions that landed differently than originally planned:**

- The plan said "make `GraphVisualization.tsx` interactive in `mode="edit"`". We instead built `WorkflowEditorCanvas.tsx` from scratch as a sibling — cleaner separation, the read-only renderer stays unchanged for run-history views.
- The plan said "click-to-add + hover-to-extend". We shipped click-to-add only; hover-extend chains roll into Phase 1B.

**One real bug surfaced and fixed during 1A closeout:** [document.validateFields](../../packages/graph-workflow/src/catalog/activities/document-validate-fields.ts) catalog schema had drifted from the runtime activity contract (flat `{ operation, fields, equals }` instead of nested `{ expression: { ... } }`; `operator: "exact"` instead of `"equals"`). Fixed + pinned with tests against the template's actual rule shapes ([document-validate-fields.test.ts](../../packages/graph-workflow/src/catalog/activities/document-validate-fields.test.ts)).

### Phase 1B — Editor completion + backend catalog adoption

The "out of Phase 1A" items, the dropped 1A items, and the backend safety work that the validateFields drift exposed during 1A closeout.

**Backend catalog adoption (landed 2026-05-23, see [feature-docs/20260523-workflow-builder-backend-catalog-adoption/](../../feature-docs/20260523-workflow-builder-backend-catalog-adoption/)):**

- [x] Shared `createCatalogParameterValidator()` in `@ai-di/graph-workflow` walks each activity's Zod schema into `GraphValidationError[]` (US-015)
- [x] `data.transform` catalog schema tightened to match the runtime contract — `fieldMapping` is `string + JSON-parseable`, `xmlEnvelope` requires exactly one `{{payload}}` placeholder when `outputFormat === "xml"` (US-016)
- [x] Backend `graph-schema-validator` consumes the catalog adapter; `activity-parameter-schema-registry.ts` deleted (US-017)
- [x] Temporal worker validator does the same; its `activity-parameter-schema-registry.ts` deleted (US-018)
- [x] Frontend `useGraphValidation` switched to the shared adapter (US-019)
- [x] Regression: `graph-schema-validator.spec.ts` `document.validateFields legacy-shape rejection` describe block pins the pre-`e99da4ef` flat-rule + `operator: "exact"` shapes as save-time rejections (US-020)
- [x] Follow-up: extend the shared validator to also call `validateActivityParameters` for `pollUntil` nodes — landed in US-052; the pollUntil branch in `packages/graph-workflow/src/validator/validator.ts` now mirrors the activity branch (registered-type check → param validation).

**Switch case-routed edge UI:**

- [ ] Custom edge component that colours / labels per-case (port the staggered-label pattern from the read-only `GraphVisualization.tsx`)
- [ ] `handleConnect` upgrade: stamps `type: "conditional"` for new edges drawn from switch source-nodes; surfaces a per-case picker in the edge component or in the switch settings panel for case-assignment
- [ ] Error-fallback edges (`type: "error"`) get equivalent treatment — colour + label

**Rich widgets for the complex parameter shapes** (per [WORKFLOW_NODE_CATALOG.md](WORKFLOW_NODE_CATALOG.md) cross-cutting-widgets table; catalog flags these with `x-widget: rich-editor-tbd`):

- [ ] `validateFields.rules` editor — list editor with per-rule-type variant forms (`field-match` / `arithmetic` / `array-match`) reflecting the nested `expression` shape; consumed by the `multi-page-report-workflow.json` template
- [ ] `splitAndClassify.keywordPatterns` editor — array of `{ pattern, segmentType }` rows
- [ ] Classification-rule list editor (used by `document.classify`)
- [x] Page-range editor (used by `document.split` `custom-ranges` variant) — `PageRangeListEditor` (US-031 / US-032), routed via `x-widget: "page-range-list"`
- [ ] Confusion-map editor (used by `ocr.characterConfusion`)

**Switch condition-builder visual tree:**

- [ ] Replace the flat single-comparison row with a tree editor (AND / OR / NOT) per `ConditionExpression` discriminated union; the recursive primitive `ConditionExpressionEditor` already supports nesting in the form (US-003), this milestone is the visual upgrade

**Group editing UI:**

- [ ] Lasso-select on the canvas → "Group selected" action
- [ ] Group editor: label / color / icon / `exposedParams[]`
- [ ] Simplified-view toggle on the canvas (collapse each group into a single chip, matching the read-only `GraphVisualization.tsx`'s `viewMode === "simplified"` rendering)
- [ ] Save round-trip on `multi-page-report-workflow.json` (5 groups) preserves group edits

**Designer feedback items that didn't ship in 1A:**

- [ ] **Hover-to-extend chains** — hovering a node's outgoing handle pops a small palette of compatible next-nodes; click adds + connects in one move (the designer's preferred interaction)
- [ ] **Node-type swap action** — change a node's type in place, preserving overlapping config (the designer's specific request from a design review)
- [ ] **User-friendly label review** — audit the Flow Control palette labels (`Switch` / `Map (fan-out)` / `Join (fan-in)`) for engineering jargon; surface user-friendly aliases where appropriate without losing the engineering name

**Auto-layout fallback:**

- [ ] Dagre-driven auto-arrange action available from the top bar AND auto-applied when a template loads without `metadata.position` set. Templates currently stack horizontally on load because `multi-page-report-workflow.json` etc. ship without positions.

**Polish from session experience:**

- [ ] Track down and silence the vestigial `borderColor` / `borderLeftColor` React style warning (audit on 2026-05-23 found no longhand/shorthand mix in our code — likely Mantine-internal, needs the exact dev-console text when it next appears)
- [ ] Surface the duration-validation regex (`apps/frontend/src/features/workflow-builder/settings/control-flow/duration-validation.ts`) into the shared validator so `pollUntil.interval` / `humanGate.timeout` etc. light up the canvas red badges instead of only the form

### Phase 2 — Library workflows + workflow-as-API + versioning

The "Phase 8+" items dissolved into a real phase, because Phase 7's AI agent and Phase 4's try-in-place both need them.

**Library workflow management:**

- [ ] Workflow type discrimination: each saved workflow is `kind: "workflow" | "library"`. Library workflows declare their top-level `inputs[]` / `outputs[]` as part of their config (these become the port descriptors of `childWorkflow` nodes that reference them in Phase 3 once typed I/O lands).
- [ ] "Save as library" action in the V2 editor's top bar — wraps the current workflow with a name + declared signature
- [ ] Library browser modal — counterpart to the existing templates picker; lists every workflow with `kind: "library"`. Replaces the free-text `workflowId` field in `ChildWorkflowNodeSettings` with a dropdown.
- [ ] Backend endpoint: `GET /api/workflows?kind=library` (extends existing list endpoint)

**Workflow-as-API surfacing:**

- [ ] Each workflow gets a "Run this workflow" panel showing: the run-trigger URL, the input schema (derived from the entry node's input port bindings + ctx declarations marked as inputs), a sample `curl`, and authentication notes
- [ ] Backend endpoint: `POST /api/workflows/:id/runs` (likely already exists via Temporal client; surface it in the UI)
- [ ] Sample input testing UI — paste a JSON payload, hit Run, see Temporal run ID

**Versioning UI on top of existing backend versioning:**

- [ ] The backend already versions workflows (see `WorkflowVersion` schema). Add a version history panel to the editor's top bar.
- [ ] "Revert to version" + "Compare to version" actions
- [ ] Library workflows pinned by-version in `childWorkflow.workflowRef`: `{ type: "library", workflowId, version?: number }` — `version` omitted = head; setting it pins the child to a specific version for reproducibility

### Phase 3 — Typed I/O artifacts

The foundational layer for Phases 4, 5, 6, and 7. Concrete decisions and the artifact taxonomy are in [TYPED_IO_DESIGN.md](TYPED_IO_DESIGN.md). Summary:

- **Artifact taxonomy** — single rooted hierarchy: `Artifact` (base) → `Document` (`MultiPageDocument` / `SinglePageDocument`), `Segment` (with parameterised `Segment<Text|Table|Figure|Form|KeyValue|Signature|Header>`), `OcrResult` / `OcrFields` / `OcrTable`, `Classification`, `ValidationResult`, `Reference`
- **Where it lives** — `packages/graph-workflow/src/types/artifacts.ts` + `artifact-registry.ts` + `subtype-check.ts`, consumed by both the backend `validateGraphConfig` walker and the frontend handle renderer + variable picker
- **PortDescriptor extension** — optional `kind?: ArtifactKind | "${ArtifactKind}[]"` field; backwards compatible (no `kind` = `Artifact`, treated as wildcard)
- **UI rendering** — colour-coded handle dots + hover tooltip + on-selection type pill. **No draw-time wire rejection** — wires remain pure execution-order arrows in Model A; type checking operates on ctx-key bindings (see TYPED_IO_DESIGN.md §5).
- **Two checkpoints (both binding-based, not edge-based):**
  1. Settings-panel variable picker filters by kind (compatible first; incompatible dimmed below a divider with a hover-tooltip naming the reason)
  2. Backend `validateGraphConfig` walks **ctx keys**: for each key, every producer port's kind must be assignable to every consumer port's kind. Errors anchor to the consumer port.
- **Subtyping** — strict nominal: `SinglePageDocument` → `Document` slot ✓; reverse ✗; no auto-wrap between `T` and `T[]`
- **Typed soft edges (workflow boundaries) — extended IN Phase 3:**
  - `CtxDeclaration` (workflow-settings drawer's ctx editor) grows optional `kind?: ArtifactKind | "${ArtifactKind}[]"` alongside the existing primitive `type` field. Workflow entry-point inputs (Track 2's `isInput: true`) get a proper kind annotation so the first hop into the graph isn't gray-on-gray. UI: new "Kind" Select column on `WorkflowSettingsDrawer` ctx rows.
  - `LibraryPortDescriptor` (Track 1) grows optional `kind?: ArtifactKind | "${ArtifactKind}[]"` alongside `type`. Library `childWorkflow` references become typed end-to-end. UI surfaces: `LibraryPortListEditor` (inside `SaveAsLibraryModal`), `LibraryPickerModal` signature summary, `ChildWorkflowNodeSettings` signature summary (alongside the Track 3 v{N}/head badge).
- **Provider catalog** — `provider-catalog.ts` companion: `{ id, displayName, category, acceptsKind, returns }`; activities with a generic `provider` parameter source dropdowns filtered by upstream `kind`

Implementation order:

- [ ] Types + registry + `isAssignable` in `packages/graph-workflow`
- [ ] Extend `PortDescriptor` with `kind?` (activity catalog ports)
- [ ] Extend `CtxDeclaration` with `kind?` (manually-declared ctx variables)
- [ ] Extend `LibraryPortDescriptor` with `kind?` (library inputs/outputs)
- [ ] Add **binding-walk** type-check pass to `validator.ts` (walks ctx keys, consults all three `kind` sources interchangeably, errors anchor to consumer port)
- [ ] Frontend: handle colour + hover tooltip + on-selection type pill (no `handleConnect` change)
- [ ] Frontend: variable picker sorts compatible-first + dims incompatible with a "why" tooltip
- [ ] Frontend: `WorkflowSettingsDrawer` ctx-rows grow a "Kind" Select column
- [ ] Frontend: `LibraryPortListEditor` ports grow a "Kind" Select column; `LibraryPickerModal` + `ChildWorkflowNodeSettings` signature summaries surface the kind
- [ ] Fan out `kind` declarations across the 41 catalog entries — framework + 4–6 exemplars in Phase 3 (split / classify / OCR / validate); full fan-out as Phase 3.x. Bulk catalog test asserts "every entry that DOES declare `kind` declares it for every port."
- [ ] Provider catalog skeleton + 1-2 example providers (Phase 3 → Phase 5 hand-off)

**Phase 3.5 — auto-wire (DESIGNED 2026-05-26; IMPLEMENTED).** Hide
port bindings behind the wire. A reachability-based resolver fills
typed input ports automatically; the settings panel exposes a friendly
"Inputs" list instead of raw `port → ctxKey` rows. Design:
[AUTO_WIRE_DESIGN.md](AUTO_WIRE_DESIGN.md). Plan:
[../../docs/superpowers/plans/2026-05-26-auto-wire.md](../../docs/superpowers/plans/2026-05-26-auto-wire.md).
Engine + on-disk JSON unchanged.

### Phase 4 — Try-in-place + caching + per-node previews

The "ComfyUI for documents" experience. Depends on Phase 3 for type-aware previews + Phase 2 for the workflow-as-API surface.

**Deploy-on-open + run-from-canvas:**

- [ ] Opening the V2 editor (or hitting "Try") registers the workflow with Temporal as a draft version and exposes a run endpoint (reuses the Phase 2 API surfacing)
- [ ] An **Input** affordance on the entry node — upload / select a document, trigger a run from inside the canvas
- [ ] Status overlay on nodes (not started / running / succeeded / failed / skipped) via Temporal query handlers
- [ ] Active edge highlight (animates the path the live execution takes)

**Per-node preview widgets** — configurable per node type, typed by Phase 3's `ArtifactKind`:

- [ ] `Document` / `MultiPageDocument` / `SinglePageDocument` preview — paginated thumbnail strip
- [ ] `Segment[]` preview — region overlay on the parent document with kind-coloured outlines (the "paging" the user described in [NOTES.md §1.5](NOTES.md#15-per-node-previews-comfyui-inspiration))
- [ ] `OcrResult` / `OcrFields` preview — structured key-value table
- [ ] `OcrTable` preview — rendered table grid
- [ ] `Classification` preview — label + confidence + the matched rule
- [ ] `ValidationResult` preview — per-rule pass / fail with the actual values that drove the decision
- [ ] Switch preview — highlight the case that matched on the active run

**Cached re-execution** — the half of the ComfyUI inspiration the previous plan revision missed. Without caching, iterating on a 17-node workflow re-runs the full chain every time the user tweaks one parameter; that breaks the "fast feedback" loop.

- [ ] Cache keyed by `(node-config-hash, input-artifact-hash)` — uses Temporal's existing replay mechanism where possible (it provides deterministic replay; not the same as iteration-speed caching but the building blocks are there), backed by a separate dev-mode cache otherwise
- [ ] Invalidation: changing a node's parameters or upstream wiring invalidates that node + everything downstream
- [ ] UI hint: per-node cache-status indicator (fresh / cached / invalidated)
- [ ] Decision item early in the phase: do we extend Temporal's `WorkflowExecutionInfo` to expose per-activity output caching, or build a sidecar K/V store keyed by config hash? Resolve before fanning out the preview widgets.

### Phase 5 — Document segmentation node pack

Composable typed nodes producing `Segment[]` artifacts. Depends on Phase 3 (the `Segment` type registry); see [NOTES.md §4](NOTES.md#4-document-segmentation-research) for the research scaffold. Each node carries `(parentDocId, pageRange, polygon, kind, confidence)`.

- [ ] `document.split.subdocument` — sub-document boundary detection. LLM-based (LandingAI ADE Split / Sensible pattern) or rules-based classifier. Output: `Document[]` with `pageRange` + `kind`.
- [ ] `document.split.layout` — region-level layout segmentation. Backend picker via the Phase 3 provider catalog: Docling DocLayNet / Azure DI Layout / Unstructured `hi_res`. Output: `Segment[]` with bbox + kind per page.
- [ ] `text.chunk.semantic` — semantic post-OCR chunking. Azure Content Understanding cross-page Markdown chunker, or LlamaIndex `SemanticSplitterNodeParser`. Output: `Segment<Text>[]`.
- [ ] `segment.crop` — extract a region as a new `SinglePageDocument` for downstream specialised OCR / VLM.

The `Segment<Kind>` parameterisation from Phase 3 makes downstream typed wiring enforceable: a `Segment<Table>` slot accepts only segments whose `kind` is `"Table"`.

### Phase 6 — Dynamic nodes (Windmill-style)

User vision: dynamic nodes — nodes defined at runtime, in the style of Windmill ([NOTES.md §1.6](NOTES.md#16-dynamic-nodes-windmill-inspiration)). Co-dependent with Phase 7.

- [ ] A `dynamic-script` activity type that proxies to a sandboxed runtime (Deno / Pyodide / Windmill-style worker — backend decision item)
- [ ] User authors TS or Python with a declared signature → signature drives the form via the same JSON Schema renderer used everywhere else
- [ ] Signature → `kind` mapping: declared parameter / return types map to registered `ArtifactKind`s from Phase 3; unknown types must be explicitly mapped (no silent fallback to `Artifact`)
- [ ] Persist the script + signature + kind-mapping alongside the workflow; rebuild palette entry from it
- [ ] Hot-reload into the running editor — published script appears as a palette entry without restart

### Phase 7 — AI workflow builder (Claude Code sub-agent)

User vision: an AI agent that builds these workflows on the fly, working in a feedback loop where it sets up the pipeline and tests it ([NOTES.md §1.7](NOTES.md#17-ai-built-workflows--feedback-loop)). The designer confirmed this is the long-term primary creation path ([NOTES.md §2](NOTES.md#2-designer-conversation-outcomes)). Depends on Phase 2 (library workflows), Phase 3 (typed I/O — narrows valid compositions), Phase 6 (dynamic nodes — agent's lever for novel work), and Phase 8 (sources — composition surface for "where does input come from").

- [ ] `.claude/agents/workflow-builder.md` agent spec
- [ ] Chat surface in the editor invokes the agent via Claude Agent SDK with a constrained tool allowlist: `{ read catalog, read library workflows, write workflow JSON, deploy, run on sample, read results, write Windmill script, register dynamic node }`
- [ ] The agent loops: build → deploy → run on sample doc → diff against expected → revise
- [ ] Type-narrowed composition: agent consumes Phase 3's `kind` metadata to reject invalid candidates before deployment
- [ ] Windmill-script authoring as the agent's escape hatch — when no existing activity fits, the agent writes a Phase-6 dynamic node and uses it
- [ ] Likely consumes the existing `@ai-di/graph-insertion-slots` package (Dylan's earlier work) as the contract for "where in this workflow can the agent splice nodes?"

### Phase 8 — Sources (document intake as nodes)

**Why this exists.** [NOTES.md §1.1](NOTES.md#11-typed-connections-between-nodes) names two halves of the typed-connections vision: a *typed artifact hierarchy* (delivered by Phase 3) AND *document sources as nodes* — a base document type with a document source such as SharePoint or API input. The source half was orphaned during the original plan write-up; this phase reclaims it.

Today (post-Phase-2-Track-2), every workflow's intake is implicit: a caller POSTs to `/api/workflows/:id/runs` with an `initialCtx` body, OR (Phase 4) the user uploads a document from the canvas's try-in-place affordance. Sources from SharePoint, email, S3, cron, watched folders, etc. would have to be glued on outside the graph (a separate cron job; an external webhook handler that calls `/runs`) — they're not first-class concepts in the workflow.

Phase 8 makes the source a node:

- [ ] **A new `source` node type** in the schema, with subtypes via the activity catalog: `source.api`, `source.upload`, `source.sharepoint`, `source.email`, `source.s3`, `source.cron`, etc. Each subtype is a normal catalog entry with its own Zod schema for static config — gets the schema-driven settings form for free.
- [ ] **Three runtime patterns**, each mapped to existing Temporal primitives:
  - **Pull** (polling) — `source.sharepoint`, `source.email`, `source.s3`: scheduled Temporal cron child workflow lists new items + spawns a workflow execution per item.
  - **Push** (webhook / API) — `source.api`, `source.webhook`: backend exposes `/api/sources/:id/ingest` and signals a workflow execution. (Phase 2 Track 2's `POST /workflows/:id/runs` is the degenerate case where the whole workflow is the source.)
  - **Manual / test** — `source.upload`: the canvas's try-in-place upload (originally filed in Phase 4 as a one-off widget) becomes the test interface for any source node. The Run drawer's paste-JSON-and-run becomes "Run with this stub document."
- [ ] **`entryNodeId` semantics extend.** A workflow whose entry is a `source` node uses the source's output as `initialCtx`. Workflows can have multiple source nodes (like Zapier multi-trigger) — each is its own entry; any can fire the same downstream pipeline.
- [ ] **Source registration is stateful.** When a workflow with a polling source saves, the backend has to know to start polling. Likely a `WorkflowSourceBinding` table keyed by lineage + version; the head-version's sources define what's actually polling. Track 3's revert-to-version flow needs to re-bind.
- [ ] **Credentials / secrets.** OAuth tokens, IMAP passwords, etc. — not in the current plan at all. Needs a `Credentials` storage table referenced by `credentialId` in the source node's static config, with the backend resolving the secret at runtime.
- [ ] **Source library.** A `source.sharepoint` config (folder, credentials, polling cadence) probably wants to be reusable across workflows — i.e., a Track-1-style library workflow but for sources. Lets you point N workflows at the same SharePoint folder without duplicating credentials.

**Reframings this enables:**

- **Phase 2 Track 2's `CtxDeclaration.isInput` becomes a degenerate `source.api` node.** Both express "this value comes from outside the workflow." Source-fed workflows bypass `isInput`; API-fed workflows can either keep using `isInput` or upgrade to an explicit `source.api` node. The migration story is graceful.
- **Phase 4's canvas-side "Input" affordance is no longer a special widget** — it's `source.upload`'s "test" interface. Phase 4 still owns deploy-on-open + status overlays + per-node previews + caching; only the upload widget moves.
- **Phase 7's agent gains a richer composition surface.** "Build me a workflow that processes invoices from this SharePoint folder" becomes a single agent invocation that wires the source too.

**Open design questions** — resolve at Phase 8 kickoff via a brainstorm:

1. **Source as node vs. source as binding.** Putting it in the graph is more elegant (composition, typed wiring, agent-friendly) but creates the lifecycle / registration problem above. Putting it outside the graph keeps the graph pure but bifurcates the user's mental model. Recommend: in the graph.
2. **One-workflow-one-source vs. shared source library.** Per the bullet above — recommend yes.
3. **Backfill semantics.** Does pointing a workflow at a SharePoint folder mean "process every existing doc" or "only docs added from now on"? Per-source choice with a sensible default.
4. **Multiple-source ordering.** When N source nodes can fire the same pipeline, do we need ordering / priority / dedup keys? Probably yes for production sources, no for `source.upload`.
5. **Migration of existing workflows.** Workflows authored before Phase 8 have implicit API intake. Do we auto-insert a `source.api` node on open, or leave them as-is and only require source nodes for new workflows? Leaving them as-is is simpler; auto-inserting normalises the model.

---

## 6. Out of scope (explicitly deferred)

- **Replacing the existing JSON editor.** Coexists for the entire Phase 1 / 2 lifetime; revisit in Phase 4 once try-in-place is the better workflow.
- **Migrating existing `apps/frontend/src/features/tables/` zod code to Zod v4.** They keep `from "zod"` (v3). Only new workflow-builder code uses `from "zod/v4"`.
- **Runtime type checks.** The engine stays Model A — `ctx` is opaque `Record<string, unknown>` at runtime. Typed I/O is a save-time + design-time UI assertion only.
- **Auto-wrap / auto-unwrap between `T` and `T[]`.** Use `map` / `join`. See [TYPED_IO_DESIGN.md §11](TYPED_IO_DESIGN.md).
- **Mobile / small-screen.** Desktop-first per design brief §14.

---

## 7. Open questions

- **AI-1192 merge timing.** Working assumption: we land first or after, either way we merge develop in when needed. No coordination with Dylan required.
- **Cached re-execution backend** (Phase 4). Temporal replay vs sidecar K/V store. Resolve early in Phase 4.
- **Dynamic-node sandbox** (Phase 6). Deno vs Pyodide vs Windmill-style worker. Resolve at Phase 6 kickoff.
- **Library workflow signature DSL** (Phase 2). Probably just `ctx` declarations marked with `isInput: true` / `isOutput: true`; needs a brief design pass at Phase 2 kickoff.
- **Source-node lifecycle + credential storage** (Phase 8). Source-as-node vs source-as-binding, source library, backfill semantics, multi-source ordering, migration of existing workflows. Five open questions enumerated in Phase 8 below; resolve at phase kickoff via a brainstorm.

---

## 8. Companion documents

- [NOTES.md](NOTES.md) — user vision (the walking notes), designer conversation outcomes, research findings, things to circle back on. Each vision thread is cross-referenced to the phase that delivers it.
- [TYPED_IO_DESIGN.md](TYPED_IO_DESIGN.md) — concrete artifact taxonomy + decisions (formerly the `TYPED_IO_BRAINSTORM.md` placeholder)
- [WORKFLOW_DESIGN_BRIEF.md](WORKFLOW_DESIGN_BRIEF.md) — designer-facing design brief
- [WORKFLOW_NODE_CATALOG.md](WORKFLOW_NODE_CATALOG.md) — every node and its settings-panel fields
- [WORKFLOW_NODE_IO_MODEL_DECISION.md](WORKFLOW_NODE_IO_MODEL_DECISION.md) — why single in / single out + blackboard (Model A; the engine model that typed I/O layers on top of, doesn't replace)
- [SESSION_HANDOFF.md](SESSION_HANDOFF.md) — current state, what just landed, what's actively being worked on
- [../SHARED_PACKAGES.md](../SHARED_PACKAGES.md) — Dylan's convention for shared packages
- [../graph-workflows/templates/README.md](../graph-workflows/templates/README.md) — template directory
