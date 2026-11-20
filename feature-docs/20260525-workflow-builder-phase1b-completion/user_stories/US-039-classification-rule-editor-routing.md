# US-039: `JsonSchemaForm` routes `x-widget: "classification-rule-editor"`

**As a** workflow author opening a `document.classify` node,
**I want** the rules array to mount the new editor,
**So that** I'm not stuck with the unsupported stub.

## Acceptance Criteria

- [x] **Scenario 1**: Routing
    - **Given** an array schema with `x-widget: "classification-rule-editor"`
    - **When** `JsonSchemaForm` renders the field
    - **Then** `ClassificationRuleEditor` mounts (data-testid `classification-rule-editor`)

- [x] **Scenario 2**: Edits propagate
    - **Given** a `JsonSchemaForm` whose `value.rules` is `[]`
    - **When** the user clicks "Add rule"
    - **Then** the form's `onChange` receives `value: { rules: [<one default rule>] }`

- [x] **Scenario 3**: No regression for other arrays
    - **Given** an array schema without the widget hint
    - **When** rendered
    - **Then** the generic array renderer is used

## Priority
- [x] High (Must Have)

## Files modified

- `apps/frontend/src/features/workflow-builder/json-schema-form/JsonSchemaForm.tsx`
- `apps/frontend/src/features/workflow-builder/json-schema-form/JsonSchemaForm.test.tsx` — extended.
