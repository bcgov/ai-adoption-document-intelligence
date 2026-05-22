# Visual Workflow Builder — Implementation Plan

**Status:** Active. Phase 1A in progress.
**Owner:** Alex.
**Last updated:** 2026-05-22.

This is the rolling source of truth for what we're building, the architectural decisions, the phased work, and what's explicitly deferred. The companion document [NOTES.md](NOTES.md) captures the user-vision walking notes, designer-conversation outcomes, and research findings that informed the plan.

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

## 4. Phased plan

### Phase 1A — Foundation slice (~2–3 weeks, in progress)

The smallest scope that produces a working visual editor across the entire current activity surface, with the schema infrastructure that future activities slot into for free.

- [x] Cut feature branch off `origin/AI-1192`
- [x] Add `zod` dependency + Zod v4 catalog scaffolding to `packages/graph-workflow`
- [x] First activity catalog entry: `file.prepare` (the tracer)
- [ ] Catalog entries for the remaining ~24 currently-registered activity types — each is a `{...}.ts` file under `packages/graph-workflow/src/catalog/activities/`
- [ ] Backend `graph-schema-validator` consumes the catalog for parameter validation, replacing the imperative `activity-parameter-schema-registry.ts`
- [ ] Temporal worker validator does the same
- [ ] Frontend Mantine JSON Schema form renderer (~300 LOC). Reads JSON Schema produced by `z.toJSONSchema(entry.parametersSchema)`. Mantine widgets per primitive type. Reads `x-widget`, `x-options`, `x-default`, `description` hints.
- [ ] New page `WorkflowEditorV2Page.tsx` at `/workflows/:id/edit-v2` and `/workflows/create-v2`. Three-column: left palette + centre canvas + right settings panel.
- [ ] Make `GraphVisualization.tsx` interactive in `mode="edit"`: `isConnectable={true}`, `onConnect` with cycle detection (port the designer's DFS), `onNodesDelete`, `onPaneDrop` for palette drag.
- [ ] Left palette (Mantine) driven by the catalog. Categorised per design brief §11. `/` search shortcut. Drag-to-canvas + click-to-add-with-hover-extend.
- [ ] Right node-settings panel (Mantine). Schema-driven for activities. Hand-built for the 6 control-flow node types (switch / map / join / childWorkflow / pollUntil / humanGate). Override slots for activities needing API-driven widgets (preserve the `azureClassify.submit` classifier-dropdown pattern).
- [ ] Variable pickers in node input slots — autocomplete from ctx declarations + upstream node outputs.
- [ ] Workflow settings drawer from top bar: name, description, version, tags, ctx declarations, entry node.
- [ ] Validation surfacing — debounced `validateGraphConfig` from `@ai-di/graph-workflow`, red node badges, click-through error drawer.
- [ ] Save / load round-trip via existing `useCreateWorkflow` / `useUpdateWorkflow` hooks. Test: load `multi-page-report-workflow.json`, rearrange, save, reload, verify identical config hash (modulo `nodeGroups` per existing hash rule).
- [ ] Templates picker (static bundle of `docs-md/graph-workflows/templates/*.json`) on the workflow-list page → "New from template" dialog.

**Out of Phase 1A, lands in Phase 1B:**

- Group editing (lasso → group → label/color/icon/exposed-params)
- Visual condition-builder tree for Switch (AND/OR/NOT). 1A ships a flat single-comparison row.
- Node-type swap (change a node's type in place, preserving overlapping config) — the designer's request
- Per-activity rich widgets the generic renderer can't express well (validation-rule list editor, classification-rule list editor, keyword-pattern editor, page-range editor, confusion-map editor) — hand-rolled overrides

### Phase 2 — Polish + per-node rich widgets

- Hand-rolled override widgets for the 5–6 activities that need them (per WORKFLOW_NODE_CATALOG cross-cutting widgets table)
- Switch's visual AND/OR/NOT condition-tree editor
- Node-type swap action
- Group editing UI
- Better empty-state, undo/redo, keyboard shortcuts

### Phase 3 — Live execution + per-node inspection ("ComfyUI for documents")

Direct from user vision: *"It should be impossible to try workflows without deploying them so you just launch it and try it out"* + per-node previews. See [NOTES.md §1](NOTES.md#1-user-vision).

- Deploy-on-open: launching the editor (or hitting "Try") registers the workflow with Temporal as a draft version and exposes a run endpoint
- An **Input** affordance on the entry node — upload/select a document, trigger a run from inside the canvas
- **Per-node preview widgets**: configurable per node type
  - Activity nodes: last-run output (key-value pairs)
  - Split nodes: paginated thumbnail strip of segments (the "paging" the user described)
  - OCR nodes: structured fields preview
  - Switch nodes: highlight the path that was taken
- Status overlay on nodes (not started / running / succeeded / failed / skipped) via Temporal query handlers
- Active edge highlight

### Phase 4 — Typed I/O artifacts (separate brainstorm doc)

Deferred. See [TYPED_IO_BRAINSTORM.md](TYPED_IO_BRAINSTORM.md) (placeholder). When opened, decide whether to introduce typed artifact kinds (`Document`, `MultiPageDocument`, `SinglePageDocument`, `Segment`, `OcrResult`, etc.) as a UI-layer assertion (engine stays untyped — colored handles + reject mismatched connections).

### Phase 5 — Document segmentation node pack

Three-tier segmentation as composable typed nodes — see [NOTES.md §4](NOTES.md#4-document-segmentation-research):

- `document.split.subdocument` — sub-document boundary detection (LLM classifier or rules; reference: LandingAI ADE Split, Sensible)
- `document.split.layout` — region-level layout segmentation (backend picker: Docling DocLayNet / Azure DI Layout / Unstructured `hi_res`)
- `text.chunk.semantic` — semantic post-OCR chunking (Azure Content Understanding / LlamaIndex `SemanticSplitterNodeParser`)
- `segment.crop` — extract a region as a new single-page `Document` for downstream specialized OCR / VLM

Output type is `Segment[]` consumable by any downstream typed node (Phase 4 makes this enforceable in the canvas).

### Phase 6 — Dynamic nodes (Windmill-style)

User vision: *"can we have dynamic nodes or basically nodes that you define at runtime like Windmill"*. See [NOTES.md §1](NOTES.md#1-user-vision).

- A `dynamic-script` activity type that proxies to a sandboxed runtime (Deno / Pyodide / Windmill-style worker)
- User authors TS or Python with a declared signature → signature drives the form via the same JSON Schema renderer used everywhere else
- Persist the script + signature alongside the workflow; rebuild palette entry from it
- Hot-reload into the running editor

Bridges nicely with Phase 7.

### Phase 7 — AI workflow builder (Claude Code sub-agent)

User vision: *"instruct an AI agent to build these workflows for you on the fly… work in a feedback loop where it sets up the pipeline and tests it and if something is not working it tweaks the code reruns it until it delivers what the user asked for"*. See [NOTES.md §1](NOTES.md#1-user-vision).

- `.claude/agents/workflow-builder.md` agent spec
- Chat surface in the editor invokes the agent via Claude Agent SDK with a constrained tool allowlist: `{ read workflow catalog, write workflow JSON, deploy, run on sample, read results }`
- The agent loops: build → deploy → run on sample doc → diff against expected → revise
- When the agent writes Windmill-style scripts (Phase 6), they become palette entries automatically
- Likely consumes the existing `@ai-di/graph-insertion-slots` package (Dylan's earlier work) as the contract for "where in this workflow can the agent splice nodes?"

### Phase 8+ — Beyond

Things the user mentioned that don't fit cleanly in the above:

- "Workflow as an API" — every workflow is deployable and externally callable. Likely already true via the existing Temporal backend; needs editor-side surfacing of the run URL / sample curl.
- Library workflows vs starter templates — design brief §7.12 distinguishes them. Initial templates picker is static; library workflows would back into a table once user-saved templates are a thing.
- Versioning UI on top of existing backend versioning.

---

## 5. Out of scope (explicitly deferred)

- **Typed I/O artifacts on the canvas.** Deferred to [TYPED_IO_BRAINSTORM.md](TYPED_IO_BRAINSTORM.md). Engine model stays Model A (single in / single out + blackboard).
- **Replacing the existing JSON editor.** Coexists for the entire Phase 1 / 2.
- **Migrating existing `apps/frontend/src/features/tables/` zod code to Zod v4.** They keep `from "zod"` (v3). Only new workflow-builder code uses `from "zod/v4"`.
- **User-managed templates / library workflows.** Phase 1A bundles static templates. User-saved library workflows are a Phase 8+ topic.
- **Mobile / small-screen.** Desktop-first per design brief §14.

---

## 6. Open questions

- **AI-1192 merge timing.** Working assumption: we land first or after, either way we merge develop in when needed. No coordination with Dylan required.
- **Per-renderer metadata vocabulary.** Currently using `x-widget`, `x-options`, `x-default`. May want to formalise this in a doc before fanning out catalog entries. Default plan: codify alongside the renderer in Phase 1A.
- **Frontend icon library mapping.** Tabler icons are already used everywhere else. Catalog's `iconHint` is a string the frontend resolves to a Tabler icon. Mapping table lives in the frontend.

---

## 7. Companion documents

- [NOTES.md](NOTES.md) — user vision (the walking notes), designer conversation outcomes, research findings, things to circle back on
- [TYPED_IO_BRAINSTORM.md](TYPED_IO_BRAINSTORM.md) — placeholder for the deferred typed-artifacts discussion
- [WORKFLOW_DESIGN_BRIEF.md](WORKFLOW_DESIGN_BRIEF.md) — designer-facing design brief
- [WORKFLOW_NODE_CATALOG.md](WORKFLOW_NODE_CATALOG.md) — every node and its settings-panel fields
- [WORKFLOW_NODE_IO_MODEL_DECISION.md](WORKFLOW_NODE_IO_MODEL_DECISION.md) — why single in / single out
- [../SHARED_PACKAGES.md](../SHARED_PACKAGES.md) — Dylan's convention for shared packages
- [../graph-workflows/templates/README.md](../graph-workflows/templates/README.md) — template directory
