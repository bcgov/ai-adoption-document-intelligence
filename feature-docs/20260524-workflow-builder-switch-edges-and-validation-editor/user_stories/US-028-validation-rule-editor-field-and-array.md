# US-028: `field-match` + `array-match` variant bodies

**As a** workflow author authoring a `field-match` or `array-match`
validation rule,
**I want** a form with the right inputs for that variant,
**So that** each rule's fields are easy to edit and validate live.

## Acceptance Criteria

- [ ] **Scenario 1**: `FieldMatchRuleBody` renders all six variant fields
    - **Given** a `field-match` rule value
    - **When** `FieldMatchRuleBody` renders
    - **Then** inputs exist for `name`, `primaryField`, `attachmentField`, `operator` (Select), `tolerance.amount` (NumberInput, optional), `tolerance.percentage` (NumberInput, optional), and `fieldType` (Select)
    - **And** the `operator` Select shows the two enum options `equals` and `approximately`
    - **And** the `fieldType` Select shows the three enum options `text`, `number`, `currency`

- [ ] **Scenario 2**: `FieldMatchRuleBody` propagates edits via `onChange`
    - **Given** a `field-match` rule with `name: ""`
    - **When** the user types `"Subtotal match"` into the `name` input
    - **Then** `onChange` fires with the rule's `name` set to `"Subtotal match"` and all other fields preserved

- [ ] **Scenario 3**: Tolerance fields default to undefined and are stripped when blank
    - **Given** a `field-match` rule with `tolerance: undefined`
    - **When** the user types `5` into `tolerance.amount`, then clears it
    - **Then** intermediate `onChange` fires set `tolerance: { amount: 5 }`, and after clear the rule's `tolerance` is `undefined` (object dropped, not `{}`)

- [ ] **Scenario 4**: `ArrayMatchRuleBody` renders the array variant correctly
    - **Given** an `array-match` rule value with `primaryFields: ["a"]` and `attachmentFields: ["b"]`
    - **When** `ArrayMatchRuleBody` renders
    - **Then** there's a list editor for `primaryFields[]` (each row a TextInput with a remove button + an Add button)
    - **And** the same for `attachmentFields[]`
    - **And** inputs exist for `name`, `matchType` (Select of `any`/`all`), `operator`, `tolerance.amount`, `tolerance.percentage`, `fieldType`

- [ ] **Scenario 5**: Adding/removing items in `primaryFields` mutates the right paths
    - **Given** an `array-match` rule with `primaryFields: ["x"]`
    - **When** the user clicks "Add" under primaryFields and types `"y"`
    - **Then** `onChange` fires with `primaryFields: ["x", "y"]`
    - **And** clicking the trash icon on the first row fires `onChange` with `primaryFields: ["y"]`

- [ ] **Scenario 6**: Required-field surfacing via Mantine `withAsterisk`
    - **Given** a `field-match` rule with `name: ""`
    - **When** `FieldMatchRuleBody` renders
    - **Then** the `name` input has a red asterisk indicator (Mantine `withAsterisk`)
    - **And** the same for `primaryField`, `attachmentField`, `operator`, `fieldType`
    - **And** `tolerance.*` inputs do NOT have asterisks

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions

- Both bodies live inside `ValidationRuleEditor.tsx` (or alongside it as
  internal modules); they're tightly coupled to the parent's dispatch.
- Selects derive their `data` from the catalog's Zod enum (extract via
  `(operatorSchema as z.ZodEnum<…>).options` or by importing the named
  constants from `document-validate-fields.ts`).
- `primaryField` / `attachmentField` are `string`; use `TextInput`. We
  may later swap to `VariablePicker` for autocomplete — for now plain
  inputs match how the rest of the renderer treats string fields.
- TDD: add scenarios to `ValidationRuleEditor.test.tsx` (or split into
  `FieldMatchRuleBody.test.tsx` + `ArrayMatchRuleBody.test.tsx` if the
  file grows large — keep co-located in the same folder).

## Files modified

- `apps/frontend/src/features/workflow-builder/settings/rich-widgets/ValidationRuleEditor.tsx`
  — adds the two variant bodies.
- `apps/frontend/src/features/workflow-builder/settings/rich-widgets/ValidationRuleEditor.test.tsx`
  — variant-body scenarios.
