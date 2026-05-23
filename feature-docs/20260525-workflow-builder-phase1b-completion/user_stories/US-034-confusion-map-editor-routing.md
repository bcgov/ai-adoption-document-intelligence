# US-034: `JsonSchemaForm` routes `x-widget: "confusion-map-editor"`

**As a** workflow author opening a `ocr.characterConfusion` node,
**I want** the `customConfusionMap` field to render as the new editor,
**So that** I'm not stuck with the unsupported stub.

## Acceptance Criteria

- [x] **Scenario 1**: Routing
    - **Given** a JSON Schema property `{ type: "object", "x-widget": "confusion-map-editor" }`
    - **When** `JsonSchemaForm` renders the field
    - **Then** `ConfusionMapEditor` mounts

- [x] **Scenario 2**: Edits propagate
    - **Given** a `JsonSchemaForm` whose `value.customConfusionMap` is `{}`
    - **When** the user adds a `{ from: "1", to: "I" }` row
    - **Then** the form's `onChange` receives `value: { customConfusionMap: { "1": "I" } }`

- [x] **Scenario 3**: Other object schemas fall back gracefully
    - **Given** an object schema without the widget hint
    - **When** rendered
    - **Then** the generic object renderer (or "Unsupported field schema" stub for free-form objects) is used — no regression

## Priority
- [x] High (Must Have)

## Files modified

- `apps/frontend/src/features/workflow-builder/json-schema-form/JsonSchemaForm.tsx`
- `apps/frontend/src/features/workflow-builder/json-schema-form/JsonSchemaForm.test.tsx` — extended.
