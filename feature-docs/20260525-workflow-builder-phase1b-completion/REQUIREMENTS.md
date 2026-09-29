# Phase 1B completion — requirements

**Workflow-builder Phase 1B items 3 (remaining 4 widgets), 4–10.** Closes Phase
1B and brings the V2 visual editor to full parity with the JSON editor for
arbitrary workflows. After this, the V2 editor can load any of the eight
templates in `docs-md/graph-workflows/templates/` and edit every field.

## Background

[IMPLEMENTATION_PLAN.md §5 Phase 1B](../../docs-md/workflow-builder/IMPLEMENTATION_PLAN.md)
lists 10 items total. Items 1 + 2 + the first of item 3 are already landed
across commits `624fb47a`, `7fd2f917`, `1c64b12b`:

- Item 1 — backend catalog adoption (`624fb47a`).
- Item 2 — switch case-routed edge UI (`7fd2f917`).
- Item 3a — `validateFields.rules` rich editor (`1c64b12b`).

What's left:

- **Item 3b–e** — the four remaining rich widgets:
  `splitAndClassify.keywordPatterns`, `document.classify.rules`,
  `document.split.custom-ranges`, `ocr.characterConfusion.customConfusionMap`.
- **Item 4** — visual switch condition-builder polish (the recursive
  editor already exists; audit + integrate).
- **Item 5** — group editing in V2 (lasso → group → panel + simplified-
  view toggle + exposed-params).
- **Item 6** — hover-to-extend chains.
- **Item 7** — node-type swap.
- **Item 8** — user-friendly label review (Flow Control palette).
- **Item 9** — auto-layout fallback (dagre).
- **Item 10** — polish: duration regex into shared validator,
  `borderColor` warning audit, `pollUntil` parameter validation
  follow-up.

The items below are **largely independent** and can land in any order
(stated by Alex). Each becomes its own milestone with its own commit.

## Goals — per milestone

### Milestone C — `document.split.custom-ranges` page-range editor (Phase 1B item 3b)

1. New `PageRangeListEditor` rich widget — list of `{ start, end }` rows
   with NumberInputs (1-based; `min(1)`; `start <= end` validation per
   row).
2. `JsonSchemaForm` routes `x-widget: "page-range-list"` to the new
   widget.
3. Loading any workflow using `document.split` with
   `strategy: "custom-ranges"` shows the ranges editable in V2.

### Milestone D — `ocr.characterConfusion.customConfusionMap` editor (Phase 1B item 3c)

1. New `ConfusionMapEditor` rich widget — list of `{ from, to }` rows
   (the `Record<string, string>` flattened to ordered rows for
   stable editing UX).
2. `JsonSchemaForm` routes `x-widget: "confusion-map-editor"` to the
   new widget.
3. Round-trip preserves the underlying object (rows → object on save;
   object → rows on load) — keys are deduplicated; last-write-wins on
   duplicate keys is surfaced as a row-level warning.

### Milestone E — `document.splitAndClassify.keywordPatterns` editor (Phase 1B item 3d)

1. New `KeywordPatternEditor` rich widget — list of
   `{ pattern, segmentType }` rows. `pattern` validated as a regex via
   `new RegExp(pattern)` in a try/catch; invalid entries surface a
   per-row error.
2. `JsonSchemaForm` routes `x-widget: "keyword-pattern-editor"` to the
   new widget.

### Milestone F — `document.classify.rules` editor (Phase 1B item 3e)

1. New `ClassificationRuleEditor` rich widget — list of rules each
   carrying `name`, `resultType`, and a nested list of `patterns[]` per
   rule. Each pattern has `scope`, `operator`, `value` per the catalog
   schema.
2. `JsonSchemaForm` routes `x-widget: "classification-rule-editor"` to
   the new widget.
3. Reuses the variant-table pattern from `ValidationRuleEditor`
   (US-027) for consistency.

### Milestone G — Switch condition-tree audit (Phase 1B item 4)

1. Confirm `ConditionExpressionEditor` already nests recursively (recon
   shows it does — `LogicalBody` + `NotBody` self-call, with
   depth-indent borderLeft styling).
2. Audit `SwitchNodeSettings` to confirm each case row uses the full
   recursive editor (not a flat single-comparison fallback).
3. If the audit surfaces any one-level cap or visual-indent regression
   under deep nesting, fix it. Otherwise this milestone is "verify +
   close" — surface as a no-op + close the menu item.

### Milestone H — Group editing in V2 (Phase 1B item 5)

1. **Lasso → group** action: dragging a marquee rectangle over multiple
   nodes selects them; a "Group selected" button in the top bar (or a
   right-click action) creates a new `nodeGroups[<id>]` entry pointing
   at the selected node ids.
2. **Group settings panel**: a new right-rail body for group editing —
   `label`, `description`, `icon` (picker), `color` (picker), and
   `exposedParams[]` (the list editor lets users pick a node + a
   parameter path, label it, and optionally constrain its options).
3. **Simplified-view toggle**: a top-bar switch that collapses each
   group into a single chip on the canvas (re-using the rendering
   pattern from `GraphVisualization.tsx` lines 285–356). Toggling back
   reveals the underlying nodes.
4. Loading `multi-page-report-workflow.json` (which has 5 groups) shows
   them editable; simplified view collapses to 5 chips.

### Milestone I — Hover-to-extend chains (Phase 1B item 6)

1. Hovering a node's outgoing source handle pops a small palette of
   compatible next-nodes (initially: all activity types + a "switch /
   map / join" control-flow row).
2. Clicking a palette entry: creates the new node, places it to the
   right of the source, and creates the connecting edge in one move.
   The new node inherits the right edge type (`normal` for activity
   sources; `conditional` for switch sources — reusing US-025's
   inference).
3. Hover behavior dismisses on click-away.

### Milestone J — Node-type swap (Phase 1B item 7)

1. Right-clicking a node opens a context menu; one entry is "Change
   activity type".
2. Picking a new type preserves: `label`, `inputs/outputs`,
   `errorPolicy`, `retry`, `timeout`, `metadata.position`, and any
   `parameters` keys whose names appear in BOTH the old and new
   catalog Zod schemas.
3. Parameters whose keys don't appear in the new schema are dropped
   silently; required keys missing in the new shape default to the
   catalog's first-enum value or empty-string (per the same
   default-shape helper as US-027).
4. Switch / map / join / etc. (control-flow types) cannot be type-
   swapped — the menu shows the entry but disabled, with a tooltip
   explaining why.

### Milestone K — User-friendly Flow Control labels (Phase 1B item 8)

1. Audit `apps/frontend/src/features/workflow-builder/palette/control-flow-palette-entries.ts`
   for engineering jargon.
2. Replace with end-user labels (e.g., "Map (fan-out)" →
   "Run for each item"; "Join (fan-in)" → "Collect results"; "Switch"
   stays; "Child workflow" → "Sub-workflow"; "Poll until" → "Wait
   until condition"; "Human gate" → "Wait for approval").
3. Concrete labels are subject to Alex's call — surface the proposed
   list for sign-off before applying.

### Milestone L — Auto-layout fallback (Phase 1B item 9)

1. `dagre-esm` is already a dependency (used by `GraphVisualization.tsx`).
   Lift the read-only renderer's layout call into a reusable
   `layoutGraph(config, options)` helper at
   `apps/frontend/src/features/workflow-builder/canvas/auto-layout.ts`.
2. A "Auto-arrange" button in the top bar runs the helper, replaces all
   `metadata.position` values, and re-fits the viewport.
3. Auto-applied on template-load when none of the nodes carry a
   `metadata.position` (matching the bug filed for templates today).

### Milestone M — Polish bundle (Phase 1B item 10 + follow-up from US-020)

1. Lift `isValidTemporalDuration()` from
   `apps/frontend/src/features/workflow-builder/settings/control-flow/duration-validation.ts`
   into `packages/graph-workflow/src/validator/duration.ts` (or
   similar) so the shared validator can call it on
   `pollUntil.interval`, `pollUntil.initialDelay`, `pollUntil.timeout`,
   and `humanGate.timeout`.
2. Wire `validateGraphConfig` to surface duration errors at
   `nodes.<id>.<field>` — frontend's `nodeIdFromPath` will pick them
   up.
3. **pollUntil parameter validation follow-up** (filed in US-020):
   extend `packages/graph-workflow/src/validator/validator.ts`
   `pollUntil` branch (around lines 326–335) to call
   `validateActivityParameters(pollNode.activityType, ...)` so
   `pollUntil`'s `parameters` get the same catalog-driven validation
   that activity nodes already get.
4. `borderColor` / `borderLeftColor` warning: the existing code uses
   longhand consistently (recon confirmed). This polish item is a
   wait-state — Alex's dev console must produce the exact warning text
   for us to chase. Filed for the user; no code change in this
   milestone unless the text arrives.

## Non-goals

- No changes to typed I/O (Phase 3).
- No changes to library workflows / workflow-as-API / versioning
  (Phase 2).
- No `splitAndClassify` regex preview / live-classification UI — just
  the per-row regex validation.
- No node-type swap across control-flow types (only activity ↔
  activity).
- No advanced auto-layout (cluster-aware) — vanilla dagre.
- No interactive group resize on the canvas (Phase 1A canvas already
  treats nodes as point positions, not bounding boxes).

## Constraints

- `CLAUDE.md`: no backwards-compatibility shims, no `any`, no
  placeholders, TDD per superpowers, doc updates under `docs-md/` for
  user-facing concepts.
- Alex's cadence preferences ([[workflow-builder-handoff]] +
  [[dev-servers-user-controlled]]): only ping at milestones; don't
  start dev servers; build the package + ask for Vite restart after
  any `packages/graph-workflow` change.
- Each milestone independent + committable on its own.

## How we'll know we're done

Per-milestone acceptance lives in the individual user stories
(`./user_stories/`). The Phase 1B completion test is:

- All 8 templates in `docs-md/graph-workflows/templates/` load fully
  editable in V2 — no "Unsupported field schema" stubs anywhere.
- Auto-arrange works on a freshly-loaded template.
- Group editing round-trips through save → reload.
- Switch nested conditions can be built without leaving the editor.

## Files affected (high level)

- `packages/graph-workflow/src/catalog/activities/*.ts` — no changes
  expected (the catalog already declares all the `x-widget` hints).
- `packages/graph-workflow/src/validator/validator.ts` — Milestone M.
- `packages/graph-workflow/src/validator/duration.ts` — NEW (Milestone M).
- `apps/frontend/src/features/workflow-builder/settings/rich-widgets/`
  — four new editors (Milestones C–F).
- `apps/frontend/src/features/workflow-builder/json-schema-form/JsonSchemaForm.tsx`
  — three more `x-widget` routes.
- `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx`
  — context menu (Milestone J), hover-to-extend (I), simplified-view
  toggle (H), auto-arrange button (L), group lasso (H).
- `apps/frontend/src/features/workflow-builder/settings/group/`
  — NEW dir for group settings (Milestone H).
- `apps/frontend/src/features/workflow-builder/canvas/auto-layout.ts`
  — NEW (Milestone L).
- `apps/frontend/src/features/workflow-builder/palette/control-flow-palette-entries.ts`
  — label revisions (Milestone K).
