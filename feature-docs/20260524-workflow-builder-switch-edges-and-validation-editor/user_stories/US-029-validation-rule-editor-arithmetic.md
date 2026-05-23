# US-029: `arithmetic` variant body with nested expression

**As a** workflow author writing an arithmetic validation rule (e.g.
`gross - deductions = net`),
**I want** a dedicated form for the nested expression,
**So that** I can build it without remembering the JSON shape.

## Acceptance Criteria

- [ ] **Scenario 1**: `ArithmeticRuleBody` renders the variant fields including a nested expression sub-form
    - **Given** an `arithmetic` rule with `expression: { operation: "sum", fields: ["a","b"], equals: "total" }`
    - **When** `ArithmeticRuleBody` renders
    - **Then** there are inputs for `name`, `operator`, `tolerance.amount`, `tolerance.percentage`, `fieldType` (top-level)
    - **And** a nested `Expression` sub-form exposes: `operation` (Select with `sum` / `difference` / `product`), `fields[]` (list editor — TextInput rows + add/remove), and `equals` (TextInput)

- [ ] **Scenario 2**: Editing the nested `operation` propagates correctly
    - **Given** the above rule
    - **When** the user changes `operation` from `sum` to `difference`
    - **Then** `onChange` fires with the rule's `expression.operation` set to `difference` and all other fields preserved

- [ ] **Scenario 3**: Adding / removing `expression.fields[]` rows works
    - **Given** the above rule
    - **When** the user clicks "Add" under fields and types `"c"`
    - **Then** `onChange` fires with `expression.fields: ["a","b","c"]`
    - **And** the trash icon on the second row fires `onChange` with `expression.fields: ["a","c"]`
    - **And** the last remaining row's trash icon is disabled (Zod schema requires `min(1)`)

- [ ] **Scenario 4**: Editing `expression.equals` propagates
    - **Given** the above rule
    - **When** the user types `"netTotal"` into the `equals` input
    - **Then** `onChange` fires with `expression.equals: "netTotal"`

- [ ] **Scenario 5**: Default-shape arithmetic rule from the variant-switch
    - **Given** a rule started life as `field-match` and the user switches type to `arithmetic`
    - **When** the rule lands in `ArithmeticRuleBody`
    - **Then** the form shows `operation: "sum"`, `fields: [""]` (one empty row), `equals: ""`, `operator: "equals"`, `fieldType: "text"` — i.e. the schema-defaults shape per US-027

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions

- The nested expression form is internal to `ArithmeticRuleBody` — a
  small dedicated sub-component is fine.
- `fields` is `z.array(z.string().min(1)).min(1)`; honour `min(1)` by
  disabling the last row's remove button.
- TDD via `ValidationRuleEditor.test.tsx` (or sibling file).

## Files modified

- `apps/frontend/src/features/workflow-builder/settings/rich-widgets/ValidationRuleEditor.tsx`
  — adds the `ArithmeticRuleBody`.
- `apps/frontend/src/features/workflow-builder/settings/rich-widgets/ValidationRuleEditor.test.tsx`
  — arithmetic scenarios.
