# US-036: `JsonSchemaForm` routes `x-widget: "keyword-pattern-editor"`

**As a** workflow author opening a `document.splitAndClassify` node,
**I want** the patterns array to render as the new editor,
**So that** I'm not stuck with the unsupported stub.

## Acceptance Criteria

- [x] **Scenario 1**: Routing
    - **Given** an array schema with `x-widget: "keyword-pattern-editor"`
    - **When** `JsonSchemaForm` renders the field
    - **Then** `KeywordPatternEditor` mounts

- [x] **Scenario 2**: Edits propagate
    - **Given** a `JsonSchemaForm` whose `value.keywordPatterns` is `[]`
    - **When** the user adds a row
    - **Then** the form's `onChange` receives `value: { keywordPatterns: [<default>] }`

- [x] **Scenario 3**: Other array schemas fall back gracefully
    - **Given** an array schema without the widget hint
    - **When** rendered
    - **Then** the generic array editor is used

## Priority
- [x] High (Must Have)

## Files modified

- `apps/frontend/src/features/workflow-builder/json-schema-form/JsonSchemaForm.tsx`
- `apps/frontend/src/features/workflow-builder/json-schema-form/JsonSchemaForm.test.tsx` — extended.
