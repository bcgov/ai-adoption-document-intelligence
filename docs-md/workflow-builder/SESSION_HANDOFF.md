# Session Handoff — Visual Workflow Builder

**Last updated:** 2026-05-22 (Milestones 1, A, B, C all landed in a single session).
**For:** the next Claude Code session picking up this work.
**Purpose:** explain everything that's been decided, what's been built, what's running, what's next.

---

## TL;DR for the next AI

Alex is building a visual workflow editor on top of Dylan's shared `@ai-di/graph-workflow` package. Phase 1A is well underway:

- **Milestone 1 (form-renderer tracer):** done. `/workflows/dev-form-preview` shows all 41 activities, the schema-driven Mantine form per activity, the emitted JSON Schema, and live Zod validation. Renderer supports primitives + enums + comboboxes + discriminated unions (root `anyOf` with `const`-valued discriminator) + arrays of primitives / simple objects.
- **Milestone "A" (stress test):** done. `document.split` modelled as a Zod v4 discriminated union (`per-page` / `fixed-range` / `custom-ranges`); renderer swaps in only the active variant's fields. Custom-ranges shows a dynamic row editor (Add/Remove rows of `{start, end}`).
- **Milestone "B" (catalog fan-out):** done. **All 41 registered activity types** now have catalog entries in `packages/graph-workflow/src/catalog/activities/`. 150 catalog tests pass. Each entry declares display name, category, ports, icon/colour hints, and a Zod parameter schema. Complex parameter shapes (rule lists, validation rules, mapping editors) carry `x-widget: rich-editor-tbd` hints flagging them for Phase 1B hand-rolled overrides.
- **Milestone 2 — C (editor skeleton):** done. New visual editor at `/workflows/create-v2` and `/workflows/:workflowId/edit-v2`. Three-column layout (palette → canvas → settings panel). Add activities by clicking the palette, drag to position, drag handle-to-handle to draw edges, click to select, edit label + parameters + port bindings in the right panel, save to backend. Coexists with the JSON editor at `/workflows/:id/edit`.

**The plan, in full, lives in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).** All architectural decisions and the phased plan are there. [NOTES.md](NOTES.md) has supporting context.

---

## How Alex wants to work

Critical preferences (honour these):

1. **Don't dump intermediate code/text at him.** Only surface clickable milestones. He explicitly said *"How am I supposed to verify what you just did? I'm not reviewing code at this phase, tell me when there's something I can play around with."*
2. **Stop pinging him with mid-work updates.** End-of-turn summary should be terse and only when the milestone is interactive.
3. **Work milestone-by-milestone.** Commit between milestones.
4. **Locked decisions are locked.** Don't re-raise typed I/O, single-in/single-out, shared package vs sibling, or Zod v4 vs Zod 3. All resolved in [IMPLEMENTATION_PLAN.md §3](IMPLEMENTATION_PLAN.md).
5. **Don't ping Dylan about AI-1192.** Just work on top of his branch.
6. **He prefers Chrome DevTools MCP over Playwright** for browser inspection. If chrome-devtools tools are unavailable in your session, Playwright via inline `node --input-type=module -e "..."` is the working fallback — see the [`app-browser-auth`](../../.claude/skills/app-browser-auth/) skill.

---

## Branch + git state

- **Branch:** `feature/visual-workflow-builder`, cut from `origin/AI-1192` (Dylan's shared-package consolidation; **not yet merged to develop**).
- **Pre-existing commit `b86741c7` "deps: pin cross-platform native binaries in root optionalDependencies"** — unrelated to the workflow builder; should land as its own PR against develop. Cherry-pick onto a dedicated branch before opening the workflow-builder PR. Don't bundle it.
- Workflow-builder commits on this branch (most recent first):
  - `5e8ad57c` frontend: visual workflow editor V2 skeleton — Milestone 2 / C
  - `a77033bb` graph-workflow: catalog entries for all registered activity types — 41 entries; bulk tests
  - `9738ff72` graph-workflow: add document.split with discriminated-union strategy — Milestone A
  - `5b6bea7a` skill: app-browser-auth for headless inspection of localhost frontend
  - `78e2a844` frontend(vite): pre-bundle `@ai-di/graph-workflow` so browser ESM accepts named exports
  - `83ecd5aa` docs: workflow-builder implementation plan, notes, and session handoff
  - `2c3b6de5` frontend: add JSON Schema form renderer + dev preview page
  - `2dbe73af` graph-workflow: add activity catalog with Zod v4 parameter schemas

If/when `origin/AI-1192` lands on `develop`, merge develop in to keep current.

---

## Shared package (`packages/graph-workflow`)

Dylan's package now contains, on this branch:

- `src/types.ts` — schema types (Dylan's, unchanged)
- `src/validator/validator.ts` — graph schema validator (Dylan's, unchanged)
- `src/validator/context-utils.ts` — ctx namespace utils (Dylan's, unchanged)
- `src/catalog/types.ts` — `ActivityCatalogEntry`, `PortDescriptor`, `CatalogCategory`
- `src/catalog/index.ts` — `ACTIVITY_CATALOG`, `getActivityCatalogEntry()`, `getActivityParametersJsonSchema()`, `listActivityTypes()`
- `src/catalog/catalog.test.ts` — bulk invariants across all entries
- **`src/catalog/activities/*.ts` — one file per registered activity type (41 files).**

Each entry: a Zod v4 schema (`from "zod/v4"`) describing static parameters, with UI hints attached via `.meta({ ... })` that ride through `z.toJSONSchema()` as `x-widget`, `x-options`, `x-default`, `x-step`, `x-options-labels` extension fields.

`package.json` depends on `zod: "3.25.76"` (the v4-bridge release). Build passes (`npm run build` in the package directory). Tests pass (`npx jest src/catalog` — 150 tests across 3 suites as of last run).

---

## Frontend additions

- **`apps/frontend/src/features/workflow-builder/json-schema-form/`** — the renderer
  - `types.ts` — minimal JSON Schema shape; `detectDiscriminatedUnion()`
  - `JsonSchemaForm.tsx` — Mantine renderer; handles string, string+enum, string+combobox, number/integer (with min/max/step), boolean, **discriminated unions**, **arrays of primitives and simple objects**
  - `index.ts` — re-exports
- **`apps/frontend/src/features/workflow-builder/catalog-utils.ts`** — frontend helpers; resolves `iconHint`/`colorHint` strings; groups catalog by category for the palette.
- **`apps/frontend/src/features/workflow-builder/palette/ActivityPalette.tsx`** — categorised left-rail palette; search + click-to-add.
- **`apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx`** — interactive xyflow canvas; selection / drag / connect; positions persist into `node.metadata.position`.
- **`apps/frontend/src/features/workflow-builder/settings/NodeSettingsPanel.tsx`** — right-rail schema-driven settings panel for activity nodes; label + parameters (via `JsonSchemaForm`) + input/output port bindings.
- **`apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx`** — the visual editor page; coexists with the JSON editor.
- **`apps/frontend/src/pages/WorkflowFormPreviewPage.tsx`** — dev-only tracer; unchanged from Milestone 1.
- **`apps/frontend/src/App.tsx`** — routes added:
  - `/workflows/dev-form-preview` — renderer tracer
  - `/workflows/create-v2` — visual editor, create mode
  - `/workflows/:workflowId/edit-v2` — visual editor, edit mode
  - old `/workflows/create` and `/workflows/:workflowId/edit` (JSON editor) untouched

Frontend `package.json` has the `@ai-di/graph-workflow` workspace dep (added by Dylan in `63f23c3a`). Vite pre-bundles the package — see commit `78e2a844`.

Type-check passes (`npx tsc --noEmit` in apps/frontend). Biome formatting clean.

---

## What was verified this session

- **Milestone 1** — dev-form-preview at `/workflows/dev-form-preview` shows all 41 activities, picks correctly, validates live.
- **Milestone A** — document.split: per-page / fixed-range / custom-ranges all switch correctly; custom-ranges array editor adds/edits/removes rows; validation green.
- **Milestone B** — every activity type opens cleanly in the renderer (sampled: Validate Fields, Classify Document, Character Confusion Fix, Generic Data Transform). Complex widgets render gracefully or show "Unsupported field schema" stubs flagged for Phase 1B.
- **Milestone 2/C** — full add → drag → edit (label + parameters + bindings) → connect → save flow exercised via Playwright. The save POST body was captured and is well-formed (`/tmp/wb-verify/saved-dto.json`): 2 nodes, 1 edge, correct entryNodeId, ctx auto-declared, parameters serialized including the discriminated-union `strategy` field.

Screenshots from the verification runs live in `/tmp/wb-verify/`.

---

## How to start the dev server (when needed)

```bash
cd /home/alstruk/GitHub/ai-adoption-document-intelligence
npm install                                # in case anything drifted
nohup npx vite --config apps/frontend/vite.config.ts apps/frontend \
  > logs/frontend-dev.log 2>&1 &
```

Dev server lands on `http://localhost:3000/`. Vite pre-bundles `@ai-di/graph-workflow`, so after package changes you may need to clear `apps/frontend/node_modules/.vite` and restart vite for the new exports to surface.

---

## What to do next

### Out of scope for Milestone 2 — pick from here for Milestone 3

The editor skeleton is functional but minimal. The next chunks (all already scoped in `IMPLEMENTATION_PLAN.md §4`):

- **Validation surfacing** — debounced `validateGraphConfig` from `@ai-di/graph-workflow`, red node badges on the canvas, a click-through error drawer.
- **Workflow settings drawer** — expose name / description / version / tags / ctx declarations / entry node in a top-bar drawer (currently name + description are inline; the rest is implicit).
- **Variable picker** — input port bindings currently take a free-text ctx key. Replace with an autocomplete dropdown sourced from the union of `ctx` declarations + upstream node outputs.
- **Control-flow nodes** — switch / map / join / childWorkflow / pollUntil / humanGate. Hand-rolled settings forms per the design brief; canvas can render them with the same `activity` node shape for now and graduate to per-type renderers.
- **Templates picker** — workflow-list page → "New from template" dialog backed by the static bundle of `docs-md/graph-workflows/templates/*.json`.
- **Load round-trip** — V2 edit-mode hydrates from `useWorkflow` on mount; verify a real-world template loads, can be edited, saved, and reloaded with identical config hash (modulo `nodeGroups` per existing hash rule).
- **Auto-fit on add** — currently the canvas doesn't auto-fit-view after each node add; user has to click the Controls fit button. Wire ReactFlow's `useReactFlow().fitView()` into a layout effect.
- **Drag-from-palette** — palette currently is click-only. The designer agreed click-to-add wins, but drag is the alternative interaction; xyflow's `onPaneDrop` is the hook.
- **Remove the React style warning** — there's a vestigial `borderColor`/`borderLeftColor` warning in dev console; suspect Mantine internal, not the editor's renderers (those use only individual border properties now).

---

## Known limitations of the M2 skeleton

- New node positions stagger horizontally at `x=80 + i*240, y=100 + (i%3)*140` — no real layout algorithm yet.
- Save backend rejects unknown `x-api-key` in headless test runs; the real user's IDIR-cookied browser session handles auth normally.
- Edges have no `sourcePort` / `targetPort` annotations — every connection drops in as `type: "normal"`. Switch's case-routed edges and error-fallback edges need a custom edge UI (Phase 1A polish or Phase 1B).
- `pollUntil.interval` (and other Temporal duration fields like `humanGate.timeout`, `pollUntil.initialDelay`, `pollUntil.timeout`) are NOT format-validated by the shared `validateGraphConfig`. The per-type frontend forms show inline duration errors via `apps/frontend/src/features/workflow-builder/settings/control-flow/duration-validation.ts`, but invalid durations are not surfaced in the canvas red badges or the validation drawer. Follow-up: lift the duration regex into `@ai-di/graph-workflow` and validate it in `validator.ts` (filed as part of US-013).
- Setting a non-existent ctx key in a port binding's text input does NOT auto-declare a new ctx entry. Only the initial node-add auto-declares; subsequent renames are user-driven.

---

## Repo layout cheatsheet

```
ai-adoption-document-intelligence/
├── apps/
│   ├── backend-services/          ← NestJS backend (Temporal client)
│   ├── temporal/                  ← Temporal worker + activity implementations
│   └── frontend/                  ← React + Mantine + Vite (the editor lives here)
│       ├── src/components/workflow/
│       │   ├── GraphVisualization.tsx        ← existing 47KB read-only renderer
│       │   ├── GraphConfigFormEditor.tsx     ← old JSON-driven form editor
│       │   ├── AzureClassifySubmitForm.tsx   ← canonical "override the generic renderer" pattern
│       │   ├── SelectClassifiedPagesForm.tsx
│       │   └── FlattenClassifiedDocumentsForm.tsx
│       ├── src/features/workflow-builder/    ← NEW; all new workflow-builder code goes here
│       │   ├── WorkflowEditorV2Page.tsx      ← M2 editor page
│       │   ├── canvas/WorkflowEditorCanvas.tsx
│       │   ├── palette/ActivityPalette.tsx
│       │   ├── settings/NodeSettingsPanel.tsx
│       │   ├── catalog-utils.ts
│       │   └── json-schema-form/             ← the renderer
│       └── src/pages/
│           ├── WorkflowEditorPage.tsx        ← old JSON editor; coexists
│           ├── WorkflowFormPreviewPage.tsx   ← dev tracer (Milestone 1)
│           ├── WorkflowListPage.tsx
│           ├── WorkflowEditPage.tsx          ← unknown status, investigate before changing
│           └── WorkflowPage.tsx              ← unknown status, investigate before changing
├── packages/
│   ├── graph-workflow/            ← Dylan's shared package; NOW has our catalog
│   │   └── src/
│   │       ├── types.ts           ← Dylan's
│   │       ├── validator/         ← Dylan's
│   │       └── catalog/           ← NEW (ours), 41 activity entries
│   ├── graph-insertion-slots/
│   ├── blob-storage-paths/
│   ├── logging/
│   └── monitoring/
└── docs-md/
    ├── SHARED_PACKAGES.md
    ├── workflow-builder/
    │   ├── IMPLEMENTATION_PLAN.md ← THE PLAN. READ FIRST.
    │   ├── NOTES.md
    │   ├── TYPED_IO_BRAINSTORM.md
    │   ├── SESSION_HANDOFF.md     ← THIS FILE
    │   ├── WORKFLOW_DESIGN_BRIEF.md
    │   ├── WORKFLOW_NODE_CATALOG.md
    │   └── WORKFLOW_NODE_IO_MODEL_DECISION.md
    └── graph-workflows/
        ├── DAG_WORKFLOW_ENGINE.md
        ├── GRAPH_TYPES.md
        ├── WORKFLOW_BUILDER_GUIDE.md
        └── templates/             ← 8 example workflow JSONs
```

---

## Memory pointers (in `~/.claude/projects/-home-alstruk-GitHub-ai-adoption-document-intelligence/memory/`)

- `project_workflow_builder_handoff.md` — **read this first** — pointers + cadence preferences
- `project_workflow_builder_decisions.md` — locked-in decisions
- `project_shared_graph_workflow_package.md` — Dylan's package status
- `project_workflow_templates.md` — where templates live
- (and unrelated: `project_openshift_deployment.md`, `project_primary_instance.md`, feedback files)

If a new top-level fact is learned (e.g., AI-1192 finally merged, a major decision flips), add a new memory file and update `MEMORY.md`. Don't put implementation details there — those go in this `SESSION_HANDOFF.md` or `IMPLEMENTATION_PLAN.md`.

---

## Things to circle back on

- `apps/frontend/src/pages/WorkflowPage.tsx` and `WorkflowEditPage.tsx` exist alongside `WorkflowEditorPage.tsx`. Three workflow pages is one (or two) too many. Worth auditing before adding more.
- Backend `activity-parameter-schema-registry.ts` only has 1 entry (`data.transform`). Most activities have no save-time parameter validation. Now that the catalog covers all 41 activities, replacing this registry to use the catalog's Zod schemas at save/execute time is the right move.
- The decoupled `mantine-form-zod-resolver` is still imported by `apps/frontend/src/features/tables/components/RowForm.tsx`. New code uses `@mantine/form`'s built-in `schemaResolver` instead.
- The V2 editor's settings panel renders parameters via `JsonSchemaForm` but doesn't yet wire `@mantine/form`'s `schemaResolver` for live form-level validation — current validation is the standalone `safeParse` shown as a count under the form.
