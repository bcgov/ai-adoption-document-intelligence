# US-032: `JsonSchemaForm` routes `x-widget: "page-range-list"`

**As a** workflow author opening a `document.split` node with
`custom-ranges`,
**I want** the rules array to mount the `PageRangeListEditor`,
**So that** I'm not stuck with the unsupported stub.

## Acceptance Criteria

- [x] **Scenario 1**: Routing
    - **Given** an array schema with `x-widget: "page-range-list"`
    - **When** `JsonSchemaForm` renders the field
    - **Then** `PageRangeListEditor` mounts (data-testid `page-range-list-editor`)

- [x] **Scenario 2**: Edits propagate
    - **Given** a `JsonSchemaForm` whose `value.customRanges` is `[]`
    - **When** the user clicks "Add range" inside the editor
    - **Then** the form's `onChange` receives `value: { customRanges: [<default>] }`

- [x] **Scenario 3**: No regression for plain array schemas
    - **Given** an array schema without the widget hint
    - **When** rendered
    - **Then** the generic array editor is used

## Priority
- [x] High (Must Have)

## Files modified

- `apps/frontend/src/features/workflow-builder/json-schema-form/JsonSchemaForm.tsx`
- `apps/frontend/src/features/workflow-builder/json-schema-form/JsonSchemaForm.test.tsx` — extended.
