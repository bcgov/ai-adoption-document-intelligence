# US-003: ConditionExpressionEditor primitive (recursive)

**As a** workflow author,
**I want to** compose arbitrarily nested `ConditionExpression` trees in a form-style editor,
**So that** I can author switch-case conditions and pollUntil termination criteria without writing JSON by hand.

## Acceptance Criteria

- [ ] **Scenario 1**: Renders all five expression kinds with their proper bodies
    - **Given** the editor receives a `ComparisonExpression`, `LogicalExpression`, `NotExpression`, `NullCheckExpression`, or `ListMembershipExpression` (one at a time)
    - **When** the editor mounts
    - **Then** the operator-type selector reflects the kind and the body renders the kind's specific fields (operands, value(s), operator dropdown)

- [ ] **Scenario 2**: `ValueRef` editor supports a Ref / Literal toggle that persists exactly one
    - **Given** a `ValueRef` field is rendered
    - **When** the user toggles between Ref and Literal, edits each side, and submits
    - **Then** the resulting `ValueRef` contains exactly one of `ref` (non-empty string) or `literal` (any value), never both

- [ ] **Scenario 3**: Switching operator-type preserves what fits
    - **Given** the editor currently holds a `ComparisonExpression` like `equals(ctx.a, 5)`
    - **When** the user changes the operator-type selector to NOT
    - **Then** the result becomes `{ operator: "not", operand: { operator: "equals", left: ..., right: ... } }` — the prior comparison is preserved as the NOT's operand

- [ ] **Scenario 4**: Logical AND/OR supports add/remove operands with visual indent
    - **Given** a `LogicalExpression` with two operands is rendered
    - **When** the user clicks Add Operand, then Remove on operand index 1
    - **Then** `onChange` fires with 3 operands, then 2, and each operand row shows with a left-border indent under the parent

- [ ] **Scenario 5**: Round-trips a 3-level deep nested expression
    - **Given** the editor receives `AND(OR(EQ(ctx.a, 5), NOT(IS-NULL(ctx.b))), CONTAINS(ctx.c, "x"))` as initial value
    - **When** the editor renders and the user makes no edits
    - **Then** the rendered structure matches the input exactly, and if any inner field is edited `onChange` emits the full updated tree

- [ ] **Scenario 6**: Reuses the existing VariablePicker for Ref mode
    - **Given** a `ValueRef` in Ref mode is rendered inside a graph that declares `ctx.foo` and has an upstream node emitting `bar`
    - **When** the user opens the Ref autocomplete
    - **Then** the same options surface that the activity-node input-binding `VariablePicker` provides (ctx keys + upstream outputs)

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Lives at `apps/frontend/src/features/workflow-builder/graph-widgets/ConditionExpressionEditor.tsx`.
- Reuse the existing `VariablePicker` (introduced in commit `634ecb3f`) for the Ref mode of `ValueRef`.
- No depth limit; usability target is 4 levels deep.
- Visual indent: a left border (`border-left: 2px solid` + `padding-left`) under each nested operand row.
- Emits `undefined` when the editor is cleared (parent decides what that means).
- Re-exported from `graph-widgets/index.ts`.
- Accompanied by a React-Testing-Library test file exercising all 6 scenarios.
