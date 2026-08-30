# US-030: `JsonSchemaForm` routes `x-widget: "validation-rule-editor"` to the new component

**As a** workflow author opening the `validateFields` node settings panel,
**I want** the rules array to render as the new editor instead of
"Unsupported field schema",
**So that** the `multi-page-report-workflow.json` template's 4 rules become
fully editable.

## Acceptance Criteria

- [x] **Scenario 1**: An array schema carrying `x-widget: "validation-rule-editor"` is routed to `ValidationRuleEditor`
    - **Given** a JSON Schema property `{ type: "array", "x-widget": "validation-rule-editor", items: { … } }`
    - **When** `JsonSchemaForm` renders that field
    - **Then** the `ValidationRuleEditor` component is mounted (verified via test-id) instead of the array fallback or "Unsupported" stub

- [x] **Scenario 2**: Edits inside the editor propagate through `JsonSchemaForm`'s `onChange`
    - **Given** the editor mounted within a `JsonSchemaForm` whose `value.rules` is `[]`
    - **When** the user clicks "Add rule" inside the editor
    - **Then** `JsonSchemaForm`'s `onChange` fires with `value: { rules: [<one default rule>] }`

- [x] **Scenario 3**: Loading `multi-page-report-workflow.json` shows 4 rules
    - **Given** a `JsonSchemaForm` mounted with the catalog `documentValidateFieldsParametersSchema` and the `validateFields` node parameters from the template
    - **When** the form renders
    - **Then** four rule rows render in the `ValidationRuleEditor`: one `arithmetic` rule with a nested expression and three more (2 × `field-match` and 1 × `array-match`)

- [x] **Scenario 4**: Without the widget hint, the array still falls back gracefully
    - **Given** any other array schema without `x-widget: "validation-rule-editor"`
    - **When** `JsonSchemaForm` renders that field
    - **Then** the existing array renderer is used (no regressions to other forms)

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions

- Add a check inside `FieldRenderer` (before the generic `array` branch)
  for `fieldSchema.type === "array" && fieldSchema["x-widget"] === "validation-rule-editor"`.
- The `ValidationRuleEditor` doesn't need to walk the JSON Schema — it
  imports the Zod schema from `@ai-di/graph-workflow` directly. The
  routing is purely "render this component instead of the generic array
  editor".
- After modifying the catalog (US-027 may add the re-export of
  `validationRuleSchema`), run `npm run build` in
  `packages/graph-workflow` and ask Alex to restart Vite per
  `feedback_dev_servers.md`.
- TDD via new test scenarios in
  `apps/frontend/src/features/workflow-builder/json-schema-form/JsonSchemaForm.test.tsx`
  (if absent, create it).

## Files modified

- `apps/frontend/src/features/workflow-builder/json-schema-form/JsonSchemaForm.tsx`
- `apps/frontend/src/features/workflow-builder/json-schema-form/JsonSchemaForm.test.tsx`
  — NEW or extended.
