# US-120: `FieldListEditor` x-widget — `source.api` `fields[]` editor

**As a** workflow author authoring a `source.api` node,
**I want** an editor that lets me add/remove/reorder fields with name / type / kind / required / description / default columns,
**So that** I can declare the API's input schema visually without writing JSON Schema by hand.

## Acceptance Criteria

- [x] **Scenario 1**: Registered as the `field-list-editor` x-widget
    - **Given** `apps/frontend/src/features/workflow-builder/json-schema-form/JsonSchemaForm.tsx`
    - **When** the form encounters a field with `x-widget: "field-list-editor"`
    - **Then** it dispatches to `FieldListEditor` (mirrors how `validation-rule-editor` / `keyword-pattern-editor` / etc. are registered)
    - **And** the dispatch is added to the existing x-widget registry — don't fork the registry

- [x] **Scenario 2**: Per-row columns + add/remove/reorder
    - **Given** `apps/frontend/src/features/workflow-builder/sources/FieldListEditor.tsx` (new)
    - **When** the editor renders against `fields[]` with N entries
    - **Then** each row displays: `name` (TextInput, URL-safe regex enforced), `type` (Select: string/number/boolean/object/array), `kind` (Select: options from `ARTIFACT_REGISTRY` plus a blank "—" Artifact option per Phase 3 US-098's convention), `required` (Checkbox), `description` (TextInput, optional), `default` (JsonInput with `autosize` + `formatOnBlur`, optional)
    - **And** an "Add field" button at the bottom appends a new row with default values
    - **And** a per-row delete icon removes that row
    - **And** drag-handle drag-reorder works (Mantine `<DragDropContext>` or the simpler row-swap UI used elsewhere in workflow-builder — pick the one already used by KeywordPatternEditor)

- [x] **Scenario 3**: `kind` Select wired to Phase 3 registry
    - **Given** the per-row `kind` Select
    - **When** opened
    - **Then** options come from `ARTIFACT_REGISTRY` (Phase 3 / US-090) — displayName as label, kind literal as value — matching the same options the existing `WorkflowSettingsDrawer` Kind column (Phase 3 / US-098) shows
    - **And** array variants (`Document[]`, `Segment[]`, …) are listed alongside their scalar counterparts
    - **And** the blank "—" option means "no kind / Artifact wildcard" — persists as `kind: undefined` (NOT `kind: "Artifact"` literal; preserve the existing "absent = Artifact" convention)

- [x] **Scenario 4**: Round-trip — save → load preserves all field props
    - **Given** a source.api configured with 3 fields including kind annotations and a non-trivial `defaultValue`
    - **When** the workflow is saved + reloaded
    - **Then** all field rows reappear with their saved values (name / type / kind / required / description / default)
    - **And** the `defaultValue` JSON round-trips losslessly (string → JSON.parse stays consistent)

- [x] **Scenario 5**: Validation — duplicate names + invalid name regex
    - **Given** the editor with one existing field `name: "documentUrl"`
    - **When** the user attempts to add another field with the same name
    - **Then** the new row's name input shows an inline error `"Field name must be unique within this source"` and the row's "Add field" is blocked until resolved
    - **And** entering a non-URL-safe name (e.g. `"my field"`) shows `"Field name must match /^[a-zA-Z_][a-zA-Z0-9_]*$/"` inline

- [x] **Scenario 6**: Frontend vitest coverage
    - **Given** `apps/frontend/src/features/workflow-builder/sources/FieldListEditor.test.tsx` (new)
    - **When** the test runs
    - **Then** Scenarios 1–5 all have assertions (registry dispatch, row rendering for the 6 columns, kind options populated from registry, save/load round-trip, validation messages)
    - **And** the frontend full vitest suite stays green

## Priority
- [x] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/sources/FieldListEditor.tsx` — new
- `apps/frontend/src/features/workflow-builder/sources/FieldListEditor.test.tsx` — new
- `apps/frontend/src/features/workflow-builder/json-schema-form/JsonSchemaForm.tsx` — register `field-list-editor` in the existing x-widget dispatch (one-line addition matching the pattern for other rich widgets)

## Technical notes

- The `kind` Select component should be the SAME shared helper used by Phase 3's Kind-column work (US-098/099) — likely a `<KindSelect>` component or a `getKindSelectOptions()` helper. Don't duplicate; if it doesn't exist as a shared helper, extract it from US-098's implementation as part of this story.
- The `defaultValue` JsonInput uses Mantine's `<JsonInput>` with `validationError` falsy when empty (not required), `autosize`, `minRows={1}`, `maxRows={4}`. Parsing happens on blur — invalid JSON shows inline error.
- Per-row delete confirms ONLY if the row had a non-empty name (preventing accidental loss of work). Empty rows delete immediately.
- The editor's `onChange` writes back the full `fields[]` array — atomic update, NOT per-row mutation. Matches how the existing rich-widget editors propagate changes.
- This story unlocks Milestone D's last frontend piece. After this, every UI surface for source.api configuration is in place.
