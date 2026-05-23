# US-038: Per-rule pattern rows (scope/operator/value)

**As a** workflow author writing a classification rule,
**I want** each rule's `patterns[]` to render as a sub-list of
`{ scope, operator, value }` rows,
**So that** I can author the per-rule matching criteria visually.

## Acceptance Criteria

- [x] **Scenario 1**: Renders one row per pattern
    - **Given** a rule with `patterns: [{ scope: "filename", operator: "contains", value: "INV-" }]`
    - **When** `ClassificationPatternRows` renders
    - **Then** one row appears with a Select for `scope`, Select for `operator`, and TextInput for `value` (all pre-filled)

- [x] **Scenario 2**: Enums come from the catalog
    - **Given** the `document.classify` catalog entry's `scope` / `operator` enums
    - **When** rendered
    - **Then** the Selects show the exact enum options declared in `packages/graph-workflow/src/catalog/activities/document-classify.ts`

- [x] **Scenario 3**: Add / remove pattern rows
    - **Given** a rule with one pattern
    - **When** "Add pattern" is clicked
    - **Then** a new row is appended with `scope: <first enum>`, `operator: <first enum>`, `value: ""`
    - **And** the trash icon on the last remaining row is disabled if the catalog requires `min(1)`

- [x] **Scenario 4**: Edits propagate up
    - **Given** a rule with one pattern
    - **When** the user changes `operator`
    - **Then** the parent `ClassificationRuleEditor` row's `onChange` fires with the updated `patterns[]` and all other fields preserved

## Priority
- [x] High (Must Have)

## Files modified

- `apps/frontend/src/features/workflow-builder/settings/rich-widgets/ClassificationRuleEditor.tsx`
  — add `ClassificationPatternRows` body.
- `apps/frontend/src/features/workflow-builder/settings/rich-widgets/ClassificationRuleEditor.test.tsx`
  — extend with US-038 scenarios.
