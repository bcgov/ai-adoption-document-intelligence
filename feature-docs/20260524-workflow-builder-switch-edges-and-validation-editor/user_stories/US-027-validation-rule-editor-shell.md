# US-027: `ValidationRuleEditor` list shell — add/remove/variant-switch

**As a** workflow author editing a `document.validateFields` node,
**I want** a dedicated list editor that lets me add, remove, and re-type
validation rules,
**So that** the discriminated-union rule array stops rendering as
"Unsupported field schema".

## Acceptance Criteria

- [x] **Scenario 1**: Empty list shows a helper line + "Add rule" button
    - **Given** a `ValidationRuleEditor` mounted with `value={[]}`
    - **When** rendered
    - **Then** a "No rules — click Add rule" empty-state line appears
    - **And** an "Add rule" button is present and enabled

- [x] **Scenario 2**: Clicking "Add rule" appends a default `field-match` rule
    - **Given** an editor at `value={[]}`
    - **When** the "Add rule" button is clicked
    - **Then** `onChange` fires with an array of length 1 whose only element has `type: "field-match"`, empty string fields for `name` / `primaryField` / `attachmentField`, `operator: "equals"`, and `fieldType: "text"`

- [x] **Scenario 3**: Each rule row has a type selector with the three variants
    - **Given** a rule of `type: "field-match"`
    - **When** the type selector is opened
    - **Then** the three options `field-match`, `arithmetic`, `array-match` are listed

- [x] **Scenario 4**: Switching variant preserves `name`, resets everything else
    - **Given** a rule `{ type: "field-match", name: "MyRule", primaryField: "a", attachmentField: "b", operator: "approximately", tolerance: { amount: 1 }, fieldType: "currency" }`
    - **When** the type selector switches to `arithmetic`
    - **Then** `onChange` fires with that index replaced by `{ type: "arithmetic", name: "MyRule", expression: { operation: "sum", fields: [""], equals: "" }, operator: "equals", fieldType: "text" }` (defaults from the Zod schema; `tolerance` and other field-match-only data dropped)

- [x] **Scenario 5**: Removing a rule shrinks the array
    - **Given** an editor with two rules
    - **When** the trash icon on the first row is clicked
    - **Then** `onChange` fires with an array of length 1 containing only what was the second rule

- [x] **Scenario 6**: Rule rows render their variant body via discriminated-union dispatch
    - **Given** rule at index 0 is `type: "field-match"` and rule at index 1 is `type: "arithmetic"`
    - **When** the editor renders
    - **Then** row 0 mounts the `FieldMatchRuleBody` component (or equivalent test-id) and row 1 mounts the `ArithmeticRuleBody` component — both wired to `onChange` for that index

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions

- Component path:
  `apps/frontend/src/features/workflow-builder/settings/rich-widgets/ValidationRuleEditor.tsx`.
- Props: `{ value: ValidationRule[], onChange: (next: ValidationRule[]) => void }`.
  `ValidationRule` type comes from `z.infer<typeof validationRuleSchema>`
  in the catalog file. Re-export `validationRuleSchema` from
  `@ai-di/graph-workflow` if not already exported, so the frontend can
  import the canonical Zod schema (no shape duplication).
- The variant-switch reset uses `defaultValueForRule(type)` — a helper
  inside this file that produces the variant's `name`-preserving default
  shape per the Zod schema.
- TDD via `ValidationRuleEditor.test.tsx`. Bodies for each variant are
  rendered as separate sub-components (US-028 and US-029); this story
  only mounts them and tests the dispatch via test-ids.
- Add/remove buttons use the same Mantine `IconPlus`/`IconTrash` pattern
  the existing `SwitchNodeSettings` uses for cases.

## Files modified

- `apps/frontend/src/features/workflow-builder/settings/rich-widgets/ValidationRuleEditor.tsx`
  — NEW (shell + dispatch).
- `apps/frontend/src/features/workflow-builder/settings/rich-widgets/ValidationRuleEditor.test.tsx`
  — NEW.
- `apps/frontend/src/features/workflow-builder/settings/rich-widgets/index.ts` — NEW.
- `packages/graph-workflow/src/catalog/activities/document-validate-fields.ts`
  — export `validationRuleSchema` if not already exported.
- `packages/graph-workflow/src/index.ts` — re-export the Zod schema for
  frontend consumption.
