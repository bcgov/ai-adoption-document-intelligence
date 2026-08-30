# Phase 2 Track 1 — Library workflow management

**Workflow-builder Phase 2, first of three tracks.** Introduces *library
workflows*: saved workflow records discriminated by a new `library`
value of the existing `WorkflowKind` enum. Library workflows declare
their top-level `inputs[]` / `outputs[]`, which become the typed port
descriptors of `childWorkflow` nodes that reference them (unblocking
Phase 3's typed I/O on cross-workflow edges) and the building blocks
the Phase 7 AI agent will compose from.

## Background

[IMPLEMENTATION_PLAN.md §5 Phase 2](../../docs-md/workflow-builder/IMPLEMENTATION_PLAN.md#phase-2--library-workflows--workflow-as-api--versioning)
splits Phase 2 into three independent tracks:

1. **Track 1 — Library workflow management.** (This document.)
2. **Track 2 — Workflow-as-API surfacing.** Filed for the next milestone.
3. **Track 3 — Versioning UI.** Filed for the milestone after that.

Tracks 2 and 3 are explicitly out of scope here. They become the next
two feature-docs.

## Locked decisions (made by Claude on session kickoff, no blocking
questions)

These choices were called by Claude based on the user's prompt + repo
state, not iterated on with the user. Each decision is recorded with
its rationale so a future session can re-litigate if circumstances
change.

### D1 — Schema discriminator: extend existing `WorkflowKind` enum

The Prisma `WorkflowLineage` model already has a `workflow_kind`
column backed by the `WorkflowKind` enum with values `primary` and
`benchmark_candidate`. Rather than add a parallel `kind` column with
`workflow | library`, add `library` as a third enum value:

```prisma
enum WorkflowKind {
  primary
  benchmark_candidate
  library
}
```

**Why:** One discriminator is honest about what we mean. The existing
default (`primary`) already maps to the user's "workflow" value. Adding
a second `kind` column for `workflow | library` would force every
consumer to track two discriminators that are mutually exclusive in
practice (a library cannot also be a benchmark candidate today).

**Mapping the user-facing names:**

- `primary` (DB) ↔ "workflow" (UI). The default; what you get when you
  click "Save".
- `library` (DB) ↔ "library" (UI). The new value; what you get when
  you click "Save as library".
- `benchmark_candidate` (DB) — untouched. Continues to behave as
  before.

### D2 — `Save as library` always creates a new workflow record

The user prompt offered the choice: "POSTs as a new workflow record
(or updates the current one — your call; surface the decision)". We
choose **always create a new record** with clone-and-promote semantics:

- The "Save" button continues to save the current workflow with its
  current `workflow_kind` (typically `primary`).
- "Save as library" copies the current canvas's `GraphWorkflowConfig`,
  stamps `metadata.kind = "library"` + the declared `inputs[]` /
  `outputs[]`, and POSTs a new `WorkflowLineage` with
  `workflow_kind = library`.
- After creation, the editor stays in the current workflow (no
  navigation away). A success toast offers a "View library" link.

**Why:** "Save as" semantics universally mean clone, not promote.
Promoting an in-progress workflow to a library is a separate decision
that should be its own action, not a side-effect of "Save as". This
keeps the editor's mental model clean and reversible — the user can
delete the new library without losing their working draft.

### D3 — Default `GET /api/workflows` excludes library workflows

The endpoint accepts `?kind=library | workflow`. The default
(no `kind` param) returns workflows where `workflow_kind != library`,
mirroring the existing behavior — the workflow list UI was never
expected to mix libraries with regular workflows.

**Why:** Libraries are not standalone runnables in the same sense as
regular workflows — they're building blocks. Surfacing them inline
in the regular list would clutter UX. The library-picker modal
explicitly filters to `kind=library`; the regular workflow list
explicitly excludes it.

**Out of scope:** A user-visible "Libraries" page is a Track 2 / Track 3
concern. Today, library workflows are reachable via the library-picker
modal only.

### D4 — Library port descriptor shape mirrors `ExposedParam`

Library inputs and outputs both use the same row shape:

```ts
interface LibraryPortDescriptor {
  label: string;
  path: string;
  type: "string" | "number" | "boolean" | "object" | "array";
}
```

**Why:** Reuses the proven ExposedParamsEditor pattern from US-044
(group panel). Types align with the existing `CtxDeclaration` set.
The `path` is a free-text string today — it will become typed +
auto-completed in Phase 3 when the typed-I/O work lands.

**No richer type tags (`select` options, `default` values) on library
ports for now.** Those are appropriate on `ExposedParam` because the
group panel exposes user-configurable knobs; library ports are about
declaring shape, not surfacing UI controls.

### D5 — `GraphMetadata` is where library declarations live

The `kind`, `inputs[]`, `outputs[]` fields go on `GraphMetadata`
(the existing `metadata` field of `GraphWorkflowConfig`), not on a
new top-level field. Existing workflows have `metadata.kind` absent —
that's interpreted as `"workflow"`.

```ts
export interface GraphMetadata {
  name?: string;
  description?: string;
  version?: string;
  tags?: string[];
  kind?: "workflow" | "library";
  inputs?: LibraryPortDescriptor[];
  outputs?: LibraryPortDescriptor[];
}
```

**Why:** Keeps related declarative metadata co-located. Avoids
shape-creep on the top-level config.

**Note:** The `metadata.kind` value on the graph config is redundant
with the `workflow_kind` column on `WorkflowLineage` once both are
written. Treat the DB column as authoritative for listing /
filtering; treat `metadata.kind` as the in-flight representation
when the config has been serialized but not yet round-tripped
through the DB.

## Goals — per milestone

### Milestone A — Shared schema + types (US-054 → US-056)

1. Add `library` to the `WorkflowKind` enum in
   `apps/shared/prisma/schema.prisma`.
2. Run `npm run db:generate` from `apps/backend-services` (per
   CLAUDE.md) to update Prisma + write models into apps/temporal/src
   and apps/backend-services/src.
3. Create the Prisma migration `add-library-workflow-kind` adding the
   enum value.
4. Extend `GraphMetadata` in `packages/graph-workflow/src/types.ts`
   with optional `kind`, `inputs[]`, `outputs[]`. Define
   `LibraryPortDescriptor` exported from the same file.
5. Add tests in `packages/graph-workflow/src/validator/*.test.ts`
   confirming the existing validator continues to accept configs
   with and without the new metadata fields.

### Milestone B — Backend `?kind=library` filter (US-057 → US-058)

1. `GET /api/workflows` accepts an optional `kind` query param with
   values `workflow | library`. The handler maps `workflow` →
   `workflow_kind = primary` and `library` → `workflow_kind =
   library`.
2. Without a `kind` param, the response **excludes** library
   workflows (mirrors today's "primary-only" mental model).
3. The Swagger DTO updates per CLAUDE.md: full `@ApiOkResponse` +
   dedicated DTO class with `@ApiProperty` decorators for the
   query param + response shape.
4. Backend unit tests in `apps/backend-services/src/workflow/` cover:
   - Unfiltered list excludes library workflows.
   - `?kind=library` returns only library workflows.
   - `?kind=workflow` returns only primary workflows.

### Milestone C — Frontend "Save as library" affordance (US-059 → US-061)

1. New top-bar action in `WorkflowEditorV2Page.tsx`, next to Save.
2. New `SaveAsLibraryModal.tsx` under
   `apps/frontend/src/features/workflow-builder/library/`. Fields:
   - Name (TextInput, prefilled from current `config.metadata.name`).
   - Description (Textarea, prefilled from current `metadata.description`).
   - Inputs: list editor (reuses the ExposedParamsEditor row pattern
     adapted to the LibraryPortDescriptor shape — `label / path /
     type`).
   - Outputs: same shape as inputs.
3. Submitting builds a new `GraphWorkflowConfig` from the current
   canvas state with `metadata.kind = "library"` + declared inputs /
   outputs, then POSTs a new workflow via the existing
   `useCreateWorkflow` hook with `workflowKind: "library"`.
4. On success: success toast with a "View library" link; editor stays
   in the current (non-library) workflow.

### Milestone D — Frontend library picker (US-062 → US-063)

1. New `LibraryPickerModal.tsx` under
   `apps/frontend/src/features/workflow-builder/library/`. Counterpart
   to `TemplatesPickerModal` — fetches from `/api/workflows?kind=library`,
   lists each library workflow with its declared signature
   (name + description + `inputs[]` / `outputs[]` summary).
2. `ChildWorkflowNodeSettings.tsx` (in
   `apps/frontend/src/features/workflow-builder/settings/control-flow/`)
   replaces the free-text `workflowId` TextInput (in the library
   branch of the workflowRef union) with a "Pick library workflow"
   button that opens the modal. Picking writes
   `workflowRef = { type: "library", workflowId: <picked.id> }`.
3. The "Inline" branch of the workflowRef union is untouched.
4. A read-only display of the selected library's
   `name / inputs / outputs` appears below the picker button.

### Milestone E — End-to-end verification (US-064)

1. Playwright walkthrough against the running dev server:
   - Load `multi-page-report-workflow.json` template.
   - Click "Save as library", declare 1 input + 1 output, save.
   - Reload `/workflows/create-v2`.
   - Add a `childWorkflow` node.
   - Open its settings, click "Pick library workflow", select the
     just-saved library, confirm `workflowRef.workflowId` is the
     library's `id`.
   - Save the new workflow, reload, confirm the childWorkflow node
     round-trips with the same library reference.

## Out of scope (filed for the next milestones)

- **Track 2 — Workflow-as-API surfacing.** Run-trigger URL panel,
  derived input schema, sample curl, paste-and-run dev affordance.
- **Track 3 — Versioning UI.** Version history panel, revert,
  compare, by-version pinning in `childWorkflow.workflowRef`.
- **Typed cross-workflow port resolution (Phase 3).** The library's
  declared `inputs[]` / `outputs[]` will become the runtime port
  descriptors of `childWorkflow` nodes that reference them. Today,
  the picker just stamps a `workflowId` — wiring the port
  descriptors into the canvas's port-binding UI is Phase 3 work.
- **Library "page" / library list UI.** Out of scope today. Library
  workflows are reachable via the library-picker modal only.
- **Editing a library.** The V2 editor *can* edit a library
  workflow (load by id, edit graph + ports, save) because the editor
  doesn't gate on `kind`. But there's no UI affordance to surface
  library workflows in the list. Filed as a known limitation; revisit
  in Track 2/3.

## Dependencies

- **Done already:** Phase 1A + Phase 1B (43 commits ahead of
  `origin/AI-1192`; SESSION_HANDOFF.md tracks the full set).
- **Out-of-band:** Pre-existing commit `b86741c7` (native-binary pin)
  should land on its own PR against `develop` before bundling the
  workflow-builder PR. Don't bundle it here.

## Cadence + constraints (from `feedback_dev_servers` + `project_workflow_builder_handoff`)

- Only ping the user when there's a clickable milestone. Don't dump
  intermediate code / types / schemas for review.
- Never start the frontend Vite or backend NestJS dev servers
  yourself — ask the user to start / restart them.
- After ANY change to `packages/graph-workflow`, build the package
  (`npm run build` in the package) and ask the user to restart Vite.
- Use TDD per `superpowers:test-driven-development`. Verify before
  claiming done per `superpowers:verification-before-completion`.
- Don't touch the old JSON editor at `/workflows/:id/edit`; it
  coexists.
