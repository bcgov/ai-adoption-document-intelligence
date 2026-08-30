# US-021: `edge-labels` helper renders `ConditionExpression` as compact one-line text

**As a** workflow author looking at the canvas,
**I want to** see each switch-case edge labelled with a compact, human-readable
form of its predicate,
**So that** I can tell the four edges leaving a switch apart without opening
the settings panel.

## Acceptance Criteria

- [x] **Scenario 1**: Simple comparison renders as `<left> <op> <right>`
    - **Given** a `ComparisonExpression` `{ operator: "equals", left: { ref: "ctx.requiresReview" }, right: { value: true } }`
    - **When** `formatConditionLabel(expression)` is called
    - **Then** it returns `"ctx.requiresReview == true"` (operator mapped to `==`, ref shown raw, value shown JSON-style)

- [x] **Scenario 2**: Operator vocabulary covers all `ComparisonExpression` operators
    - **Given** each of `equals`, `not-equals`, `gt`, `gte`, `lt`, `lte`, `contains`
    - **When** `formatConditionLabel` is called on a comparison using that operator
    - **Then** the rendered glyph is `==`, `!=`, `>`, `>=`, `<`, `<=`, and `contains` respectively

- [x] **Scenario 3**: Logical / not / null-check / list-membership fall back to operator + arity
    - **Given** a `LogicalExpression` with `operator: "and"` and three operands
    - **When** `formatConditionLabel` is called
    - **Then** it returns `"and (3)"`
    - **And** a `NotExpression` returns `"not (…)"` where `…` is the inner formatted label
    - **And** a `NullCheckExpression` returns `"<ref> is null"` or `"<ref> is not null"` based on its `negate` flag
    - **And** a `ListMembershipExpression` returns `"<ref> in [N items]"` where `N` is the operand count

- [x] **Scenario 4**: Long output is truncated with an ellipsis
    - **Given** an expression whose rendered form exceeds 40 characters
    - **When** `formatConditionLabel(expression, { maxLength: 40 })` is called
    - **Then** the returned string is exactly 40 characters and ends with `…`

- [x] **Scenario 5**: Case label helper composes `case[i]: <label>` / `default` / `on error`
    - **Given** `formatCaseLabel({ caseIndex: 2, expression })` returns `"case[2]: <expression-label>"`
    - **And** `formatCaseLabel({ kind: "default" })` returns `"default"`
    - **And** `formatCaseLabel({ kind: "error" })` returns `"on error"`
    - **Then** these are the strings the WorkflowEdge component will render

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions

- Pure function; no React, no Mantine. Lives at
  `apps/frontend/src/features/workflow-builder/canvas/edge-labels.ts`.
- TDD-first — write tests in `edge-labels.test.ts` covering all five
  scenarios, then implement.
- `ConditionExpression` discriminated union lives in
  `packages/graph-workflow/src/types.ts` (re-exported through
  `apps/frontend/src/types/workflow.ts`).
- `ValueRef` resolution: if `{ ref: "x" }` → emit the ref string raw; if
  `{ value: v }` → `JSON.stringify(v)` (strings get quoted, booleans/numbers
  bare, null → `null`).
- `maxLength` default is 60 characters when omitted.

## Files modified

- `apps/frontend/src/features/workflow-builder/canvas/edge-labels.ts` — NEW.
- `apps/frontend/src/features/workflow-builder/canvas/edge-labels.test.ts` — NEW.
