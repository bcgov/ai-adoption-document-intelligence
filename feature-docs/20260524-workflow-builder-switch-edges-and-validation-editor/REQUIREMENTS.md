# Switch case-routed edges + validateFields rich editor — requirements

**Phase 1B items 2 + 3, workflow-builder.** Two independent milestones bundled
in one feature-doc so the `multi-page-report-workflow.json` template — today
loadable + saveable byte-for-byte but visually flat at the switch and
unsupported-stub at validateFields — becomes fully editable in V2.

## Background — what triggered this

Phase 1B item 1 (backend catalog adoption) landed on 2026-05-23 in `624fb47a`:
saving a workflow whose `document.validateFields` parameters use the legacy
flat rule shape now hard-fails with HTTP 400 carrying paths like
`nodes.<id>.parameters.rules.0.expression`. Phase 1A's round-trip walkthrough
also surfaced two unresolved gaps that this feature-doc closes:

1. **Switch case-routed edges are visually flat.** Today's
   `WorkflowEditorCanvas.handleConnect` stamps every new edge as
   `type: "normal"`. Switch nodes carry N+1 outgoing edges referenced
   schema-side via `cases[].edgeId` / `defaultEdge`, but on the canvas all 4
   outgoing edges from `segmentRouter` in `multi-page-report-workflow.json`
   look identical, and drawing a deleted case edge loses its `conditional`
   tag.
2. **`document.validateFields.rules` is uneditable in V2.** The catalog
   entry at `packages/graph-workflow/src/catalog/activities/document-validate-fields.ts`
   declares the parameter schema as a discriminated-union array of
   `field-match` / `arithmetic` / `array-match` rule variants with
   `x-widget: "validation-rule-editor"`. The generic
   `JsonSchemaForm` renders the field as an "Unsupported field schema" stub
   because it doesn't know how to handle a discriminated-union *inside* an
   array. The 4 rules in the template currently load and round-trip through
   save unchanged (the form spreads the value through opaquely), but users
   can't *edit* them.

Both gaps are blocking edits to the template that motivated Phase 1A's
walkthrough.

## Goals

### Milestone A — Switch case-routed edges (Phase 1B item 2)

1. New edges drawn from a switch node's source handle are stamped
   `type: "conditional"` (not `"normal"`).
2. New edges drawn from a node whose `errorPolicy.onError === "fallback"`
   *via a dedicated error source handle* are stamped `type: "error"`. Normal
   completion edges from the same node remain `type: "normal"`.
3. Conditional edges sourced from a switch render with a distinct stroke
   colour + a label showing either the case predicate (e.g.
   `case[0]: requiresReview == true`) or the literal `default` when the
   edge id appears in `switch.defaultEdge`.
4. Error edges render with a distinct red stroke + an `on error` label.
5. The per-case `EdgePicker` in `SwitchNodeSettings` lists only the edges
   originating at the current switch *that are typed `conditional`* (plus
   the currently-selected stale value if any, surfaced as a stale warning).
6. Loading `multi-page-report-workflow.json` shows the four
   `segmentRouter` outgoing edges with distinct labels:
   `case[0]: …`, `case[1]: …`, `case[2]: …`, `default`.

### Milestone B — `validateFields.rules` rich editor (Phase 1B item 3, first of five)

1. A new `ValidationRuleEditor` widget renders the discriminated-union
   array of rule variants directly off the catalog's Zod schema.
2. Each rule row exposes a type selector (`field-match` / `arithmetic` /
   `array-match`) plus per-variant fields:
   - `field-match`: `name`, `primaryField`, `attachmentField`, `operator`,
     `tolerance` (optional, with `amount` and `percentage`), `fieldType`.
   - `arithmetic`: `name`, nested `expression` (with `operation`, `fields[]`,
     `equals`), `operator`, `tolerance` (optional), `fieldType`.
   - `array-match`: `name`, `primaryFields[]`, `attachmentFields[]`,
     `matchType`, `operator`, `tolerance` (optional), `fieldType`.
3. Changing `type` resets the variant-specific fields (the discriminator
   change clears fields that don't belong to the new variant). `name` is
   preserved across a type switch because it lives on every variant.
4. `JsonSchemaForm` recognises `x-widget: "validation-rule-editor"` on an
   array schema and routes to the new component instead of the unsupported
   stub.
5. Loading `multi-page-report-workflow.json` shows all 4 rules
   (1 arithmetic + 2 field-match + 1 array-match), each individually
   editable. Save → reload preserves the rules byte-for-byte.
6. The component validates each rule via the canonical Zod schema from the
   catalog (single source of truth — no duplicated rule shape).

## Non-goals

- **No backend changes.** Both milestones are frontend-only. The shared
  edge `type` field is already part of `GraphEdge` in
  `packages/graph-workflow/src/types.ts`. The catalog's validation-rule
  schema is unchanged.
- **No new validation rules / no new rule types.** The discriminated-union
  members are exactly the three the catalog already declares.
- **No changes to the four other rich widgets** filed in Phase 1B item 3
  (`splitAndClassify.keywordPatterns`, classification rules, page-range
  editor, confusion-map editor). Those are subsequent work items in the same
  Phase 1B menu.
- **No auto-routing or auto-layout for case edges.** Visual differentiation
  by colour/label only; manual placement remains the user's responsibility.
- **No changes to `pollUntil` parameter validation behavior.** Filed as a
  Phase 1B follow-up after the backend catalog adoption.
- **No changes to the old JSON editor** at `/workflows/:id/edit`. It
  coexists.
- **No new edge types beyond what `GraphEdge.type` already supports**
  (`"normal" | "conditional" | "error"`).
- **Per-case picker is single-select, not multi-select.** A given case
  references exactly one edge, matching today's schema.

## Constraints

- `CLAUDE.md`:
  - When updating existing code, do not add backwards compatibility
    features.
  - Avoid `any` types in both backend and frontend code.
  - Do not create placeholders / partial implementations.
  - Generic system — no document-specific implementation.
- Alex's cadence preferences (from
  `~/.claude/projects/.../memory/project_workflow_builder_handoff.md` and
  `feedback_dev_servers.md`):
  - Only surface milestones the user can click + play with.
  - Never start the dev servers yourself — ask Alex to start/restart.
  - After ANY change to `packages/graph-workflow`, build it and ask Alex
    to restart Vite.
- TDD per `superpowers:test-driven-development`. Verify per
  `superpowers:verification-before-completion` before claiming done.

## How we'll know we're done

### Milestone A done when:
- `WorkflowEditorCanvas.handleConnect` stamps `conditional` for new edges
  from switch sources and `error` for new edges drawn from the error
  source handle on nodes whose `errorPolicy.onError === "fallback"`.
- Activity / control-flow node renderers expose a second source handle
  (id `error`) when their node carries `errorPolicy.onError === "fallback"`.
  Nodes without that policy expose only the existing single source handle.
- A custom xyflow edge component renders conditional and error edges with
  distinct stroke colour + a label. The label for a conditional edge from
  a switch reads either the predicate (compact human-readable form) or
  `default`.
- `SwitchNodeSettings` per-case `EdgePicker` filters its candidates to
  edges typed `conditional`.
- A new `WorkflowEditorCanvas` test asserts the connect-time edge-type
  stamping for: switch source → `conditional`; activity source with
  `errorPolicy.onError === "fallback"` and source handle `error` →
  `error`; everything else → `normal`.
- A new test for the custom edge component asserts label resolution for:
  case[0..n], `default`, and `on error`.
- A new `EdgePicker` test asserts the type filter (only `conditional`
  edges are candidates when used inside `SwitchNodeSettings`).
- Live verification (Playwright / chrome-devtools MCP): `multi-page-report-workflow.json`
  loads and the `segmentRouter`'s four outgoing edges show distinct
  conditional-coloured strokes + labels (`case[0]: …`, `case[1]: …`,
  `case[2]: …`, `default`).

### Milestone B done when:
- A new `ValidationRuleEditor` component lives at
  `apps/frontend/src/features/workflow-builder/settings/rich-widgets/ValidationRuleEditor.tsx`.
  It owns the full three-variant form, sourcing the variant fields' types
  + enums from the catalog's Zod schema (no duplicated shape).
- `JsonSchemaForm` routes an array schema carrying
  `x-widget: "validation-rule-editor"` to `ValidationRuleEditor`.
- A new `ValidationRuleEditor.test.tsx` covers: variant-switch resets
  variant-only fields (and preserves `name`); field-level required
  validation; the nested `expression` form; add / remove rule controls;
  array fields (`primaryFields` / `attachmentFields`) add + edit + remove.
- Live verification: `multi-page-report-workflow.json` loads and the
  `validateFields` node's settings panel shows 4 editable rules. Editing
  the arithmetic rule's `expression.operation` to a different valid value
  and saving → reload preserves the change. Discarding and reloading
  shows the original rules byte-for-byte.

## Open questions resolved as defaults (auto-mode)

- **Edge stroke colour conventions** — `conditional` → switch accent
  (purple-ish, matching the diamond's `getControlFlowVisualHints("switch").color`);
  `error` → `var(--mantine-color-red-6, #e03131)`; `normal` → existing
  `#9ca3af`. Stroke width unchanged.
- **Case label format** — `case[i]: <predicate>` where `<predicate>` is a
  compact left/operator/right rendering of `ConditionExpression`
  (no nested-tree rendering — only the first level). For logical / not /
  null-check / list-membership expressions, fall back to the operator
  name (e.g. `and (3)`).
- **Default-case label** — literal string `default`.
- **Error-edge label** — literal string `on error`.
- **Per-case EdgePicker filter** — `edgeTypes={["conditional"]}` plus
  whatever value is currently bound (so a stale ref surfaces a warning
  rather than silently disappearing). The existing stale-reference warning
  already handles the latter; no new code needed beyond passing the
  current value through.
- **Error source handle position** — bottom of node (`Position.Bottom`)
  so it doesn't collide with the existing right-side normal-output handle.
- **Variant-switch field-reset policy** — preserve `name` only; everything
  else is variant-specific and gets cleared to schema defaults (empty
  string / empty array / undefined). The discriminator `type` itself is
  set to the newly-picked variant.
- **`tolerance.amount` and `tolerance.percentage`** — both optional in the
  schema; the editor renders both inputs but neither is required. If both
  are left blank, the field is omitted entirely (matching how the rest of
  the form does optional fields).
- **`fieldType` default for a new rule** — `"text"` (first enum value).
- **`operator` default for a new rule** — `"equals"` (first enum value).
- **Display order inside a rule row** — `type` selector top, then `name`,
  then variant-specific fields top-down in the order the Zod schema
  declares them, then `operator`, then `tolerance`, then `fieldType`.

If any of these conflict with what Alex actually wants, they're easy to
flip — they're presentation, not architecture.

## Files to touch

### Milestone A — Switch case-routed edges

NEW:
- `apps/frontend/src/features/workflow-builder/canvas/WorkflowEdge.tsx`
- `apps/frontend/src/features/workflow-builder/canvas/WorkflowEdge.test.tsx`
- `apps/frontend/src/features/workflow-builder/canvas/edge-labels.ts`
  (helper to render a `ConditionExpression` as a compact one-line label)
- `apps/frontend/src/features/workflow-builder/canvas/edge-labels.test.ts`

MODIFIED:
- `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx`
  — register `WorkflowEdge` as the xyflow edge type, route through new
    edge component, second `error` source handle on nodes whose
    `errorPolicy.onError === "fallback"`, `handleConnect` upgrade.
- `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.test.tsx`
  — new assertions for connect-time edge-type stamping.
- `apps/frontend/src/features/workflow-builder/graph-widgets/EdgePicker.tsx`
  — add optional `edgeTypes?: GraphEdge["type"][]` filter prop.
- `apps/frontend/src/features/workflow-builder/graph-widgets/EdgePicker.test.tsx`
  — coverage for the new filter.
- `apps/frontend/src/features/workflow-builder/settings/control-flow/SwitchNodeSettings.tsx`
  — pass `edgeTypes={["conditional"]}` to both pickers (per-case + default).
- `apps/frontend/src/features/workflow-builder/settings/control-flow/SwitchNodeSettings.test.tsx`
  — coverage update.

### Milestone B — validateFields.rules rich editor

NEW:
- `apps/frontend/src/features/workflow-builder/settings/rich-widgets/ValidationRuleEditor.tsx`
- `apps/frontend/src/features/workflow-builder/settings/rich-widgets/ValidationRuleEditor.test.tsx`
- `apps/frontend/src/features/workflow-builder/settings/rich-widgets/index.ts`

MODIFIED:
- `apps/frontend/src/features/workflow-builder/json-schema-form/JsonSchemaForm.tsx`
  — recognise `x-widget: "validation-rule-editor"` on an array schema and
    delegate to `ValidationRuleEditor`.

NO changes expected to `packages/graph-workflow` for Milestone B. The
catalog schema is already the source of truth. The component imports the
schema directly via the package re-export.

## References

- Read-only renderer pattern for staggered switch-edge labels:
  `apps/frontend/src/components/workflow/GraphVisualization.tsx`
- Catalog entry: `packages/graph-workflow/src/catalog/activities/document-validate-fields.ts`
- Edge type: `packages/graph-workflow/src/types.ts:196`
- Existing `EdgePicker`: `apps/frontend/src/features/workflow-builder/graph-widgets/EdgePicker.tsx`
- Existing `SwitchNodeSettings`: `apps/frontend/src/features/workflow-builder/settings/control-flow/SwitchNodeSettings.tsx`
- Existing generic renderer: `apps/frontend/src/features/workflow-builder/json-schema-form/JsonSchemaForm.tsx`
- Template fixture: `docs-md/graph-workflows/templates/multi-page-report-workflow.json`
