# Session Handoff — Visual Workflow Builder

**Last updated:** 2026-05-23 (Phase 1A closeout: US-014 auto-fit-on-add landed; control-flow audit complete; round-trip walkthrough on `multi-page-report-workflow.json` pending Alex's sign-off).
**For:** the next Claude Code session picking up this work.
**Purpose:** explain everything that's been decided, what's been built, what's running, what's next.

---

## TL;DR for the next AI

Alex is building a visual workflow editor on top of Dylan's shared `@ai-di/graph-workflow` package. **Phase 1A is complete (2026-05-23). Phase 1B starts next.** Post-1A phases were re-sequenced on 2026-05-23 — see [IMPLEMENTATION_PLAN.md §4 Phase dependencies](IMPLEMENTATION_PLAN.md#4-phase-dependencies) for the new DAG.

**What shipped in Phase 1A:**

- **All 41 registered activity types** have catalog entries in `packages/graph-workflow/src/catalog/activities/`. 158 catalog tests pass. Each entry declares display name, category, ports, icon/colour hints, and a Zod parameter schema. Complex parameter shapes carry `x-widget: rich-editor-tbd` hints for Phase 1B hand-rolled overrides.
- **The V2 visual editor** at `/workflows/create-v2` and `/workflows/:workflowId/edit-v2` — three-column layout (palette → canvas → settings). All 7 node types (activity / switch / map / join / childWorkflow / pollUntil / humanGate) addable from the palette, editable in the right rail, validated on the canvas (debounced + red badges + click-through drawer), saveable.
- **Form renderer** at `/workflows/dev-form-preview` — schema-driven Mantine form per activity, JSON Schema preview, live Zod validation. Supports primitives + enums + comboboxes + discriminated unions + arrays.
- **Templates picker** (static bundle of `docs-md/graph-workflows/templates/*.json`).
- **Save / load round-trip** — verified end-to-end on 2026-05-23 against `multi-page-report-workflow.json`: 16 nodes / 17 edges / 5 nodeGroups / 17 ctx declarations preserve byte-for-byte. The Playwright walkthrough surfaced one real bug — catalog drift on `document.validateFields` — which is now fixed and pinned with tests.
- **Auto-fit on add** (US-014, 2026-05-23).
- Coexists with the old JSON editor at `/workflows/:id/edit`.

**The plan, in full, lives in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).** All architectural decisions, the new phase-dependency DAG, and the full Phase 1B → Phase 7 plan are there. [NOTES.md](NOTES.md) has supporting context plus a vision-thread → phase mapping. [TYPED_IO_DESIGN.md](TYPED_IO_DESIGN.md) has the concrete artifact taxonomy for Phase 3.

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

**Phase 1A is closed.** The post-1A plan was re-sequenced on 2026-05-23 (see [IMPLEMENTATION_PLAN.md §4](IMPLEMENTATION_PLAN.md#4-phase-dependencies) for the new dependency DAG). The next phase is **Phase 1B — Editor completion + backend catalog adoption**. The full menu of Phase 1B work lives in [IMPLEMENTATION_PLAN.md §5 Phase 1B](IMPLEMENTATION_PLAN.md#phase-1b--editor-completion--backend-catalog-adoption); the short version:

### Phase 1B short menu

1. **Backend catalog adoption** — make `graph-schema-validator` (NestJS) + the Temporal worker validator consume the `@ai-di/graph-workflow` catalog instead of `activity-parameter-schema-registry.ts`. The validateFields drift the editor caught on 2026-05-23 would not have been caught at save time today; this closes that gap.
2. **Switch case-routed edge UI** — custom edge component (colour / label per case), `handleConnect` upgrade that stamps `type: "conditional"` for new edges drawn from switches, per-case picker in the switch settings.
3. **Rich widgets for the five complex parameter shapes** — `validateFields.rules` (nested `expression` per the just-landed fix), `splitAndClassify.keywordPatterns`, classification rules, page-range editor, confusion-map editor. Activate the `x-widget: rich-editor-tbd` hints in the catalog.
4. **Visual condition-builder tree** for switch (AND / OR / NOT) — `ConditionExpressionEditor` already supports recursive nesting (US-003); this milestone is the visual upgrade.
5. **Group editing UI** — lasso → group → label / color / icon / exposed-params, plus simplified-view toggle (port the read-only `GraphVisualization.tsx` rendering).
6. **Hover-to-extend chains** — the designer's preferred interaction that dropped from 1A; hovering a node's outgoing handle pops a small palette of compatible next-nodes.
7. **Node-type swap action** — change a node's type in place, preserving overlapping config.
8. **User-friendly label review** — audit Flow Control palette labels for engineering jargon.
9. **Auto-layout fallback** — dagre auto-arrange, auto-applied when a template loads without `metadata.position`.
10. **Polish** — duration-format validation into the shared validator; chase the borderColor warning once Alex pastes the exact dev-console text.

Pick any of these as the next milestone; they are not strictly ordered within Phase 1B (with the exception that the backend catalog adoption is the safety-first item and should land early).

### Already shipped — don't re-implement

- Validation surfacing (US-013) — debounced `validateGraphConfig`, red node badges, click-through drawer. Confirmed working on `multi-page-report-workflow.json` walkthrough.
- Workflow settings drawer — exposes name / description / version / tags / ctx / entry node from the top bar.
- Variable picker (`VariablePicker`) — autocomplete from ctx + upstream node outputs.
- All six control-flow node forms (switch / map / join / childWorkflow / pollUntil / humanGate) — US-004 → US-009 + US-010 wiring.
- Templates picker — backed by static bundle of `docs-md/graph-workflows/templates/*.json`.
- Save / load round-trip — verified byte-for-byte against `multi-page-report-workflow.json` (16 nodes / 17 edges / 5 nodeGroups / 17 ctx declarations).
- Auto-fit on add (US-014, 2026-05-23) — palette adds animate the new node into view via `useReactFlow().fitView()`.

## Phase 1B follow-ups previously filed here

All four items below were filed in this section on 2026-05-23 and are now part of the canonical Phase 1B menu in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). Kept here for searchability + the specific code references the next session will need.

- **Switch case-routed edges — visual differentiation + edge-type setting.** Today `GraphEdge` has `sourcePort`/`targetPort` fields in the type, but the canvas never sets them; `handleConnect` always emits `type: "normal"`. So switch `cases[].edgeId` references work logically, but on the canvas all 4 outgoing edges of `segmentRouter` in `multi-page-report-workflow.json` look identical, and re-drawing a deleted case edge loses its `conditional` tag. Picking this up needs: (1) a custom edge component that colours/labels per-case (look at the read-only `GraphVisualization.tsx`'s `staggered switch-edge labels` for the pattern), (2) UI in `SwitchNodeSettings` to mark an edge as case-routed when picked in an `EdgePicker`, (3) a `handleConnect` upgrade that consults the source node's type and stamps the right edge type. Likely a milestone of its own.
- **`borderColor` / `borderLeftColor` React style warning.** Audit on 2026-05-23 found no longhand/shorthand mix in `apps/frontend/src/features/workflow-builder/` (all renderers use longhand `borderTopColor`/`borderRightColor`/`borderBottomColor`/`borderLeftColor` consistently). Likely Mantine internal. Needs the exact dev-console text from Alex before it can be chased — speculative grep didn't turn it up.
- **Rich-widget overrides for `splitAndClassify.keywordPatterns` + `validateFields.rules`.** Already flagged via `x-widget: rich-editor-tbd` in the catalog. The current generic `JsonSchemaForm` renders these as "Unsupported field schema" stubs. The underlying parameter VALUE round-trips fine (the form spreads it through unchanged), but users can't *edit* these fields in V2. Phase 1B hand-rolled overrides per `WORKFLOW_NODE_CATALOG.md` cross-cutting widgets table.
- **Auto-layout / dagre integration.** Templates lack `metadata.position` so all 17 template nodes of `multi-page-report-workflow.json` stack at the linear stagger `x=80+i*220, y=80`. The user must rearrange manually before saving. Per [IMPLEMENTATION_PLAN.md Phase 1B](IMPLEMENTATION_PLAN.md#phase-1b--editor-completion--backend-catalog-adoption).

---

## Known limitations of the M2 skeleton

- New node positions stagger horizontally at `x=80 + i*240, y=100 + (i%3)*140` — no real layout algorithm yet. Auto-fit on add (US-014, landed 2026-05-23) keeps the new node visible but does not auto-arrange the whole graph.
- Save backend rejects unknown `x-api-key` in headless test runs; the real user's IDIR-cookied browser session handles auth normally.
- Edges have no `sourcePort` / `targetPort` annotations — every connection drops in as `type: "normal"`. Switch's case-routed edges and error-fallback edges need a custom edge UI. **Filed as Phase 1B follow-up above.**
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
    │   ├── NOTES.md               ← user-vision walking notes + research; vision-thread → phase mapping at the top
    │   ├── TYPED_IO_DESIGN.md     ← concrete artifact taxonomy for Phase 3
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
