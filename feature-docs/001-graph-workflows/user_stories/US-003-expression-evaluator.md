# US-003: Implement the Structured Operator DSL Expression Evaluator

**As a** developer,
**I want to** have an expression evaluator that interprets the structured operator DSL for condition expressions,
**So that** switch nodes and pollUntil nodes can evaluate branching conditions against the workflow context at runtime.

## Acceptance Criteria
- [ ] **Scenario 1**: Comparison expressions evaluate correctly
    - **Given** a `ComparisonExpression` with operators `equals`, `not-equals`, `gt`, `gte`, `lt`, `lte`, or `contains`
    - **When** the evaluator processes the expression against a context object
    - **Then** the correct boolean result is returned using strict equality (no implicit type coercion)

- [ ] **Scenario 2**: Logical expressions evaluate with short-circuit semantics
    - **Given** a `LogicalExpression` with `and` or `or` operator
    - **When** the evaluator processes it
    - **Then** `and` stops at the first false operand and `or` stops at the first true operand

- [ ] **Scenario 3**: Not expressions negate correctly
    - **Given** a `NotExpression` wrapping another condition
    - **When** the evaluator processes it
    - **Then** the boolean result of the inner expression is negated

- [ ] **Scenario 4**: Null check expressions handle null and undefined
    - **Given** a `NullCheckExpression` with `is-null` or `is-not-null` operator
    - **When** evaluated against a context where the referenced value is `null`, `undefined`, or present
    - **Then** `null` and `undefined` are both treated as null; `is-null` returns true for both

- [ ] **Scenario 5**: List membership expressions work
    - **Given** a `ListMembershipExpression` with `in` or `not-in` operator
    - **When** the value is checked against an array
    - **Then** the correct membership result is returned

- [ ] **Scenario 6**: Context variable references resolve with dot notation
    - **Given** a `ValueRef` with `ref: "ctx.currentSegment.blobKey"`
    - **When** the evaluator resolves the reference
    - **Then** it traverses `ctx.currentSegment` and accesses `.blobKey`; if any intermediate property is null/undefined, the entire ref evaluates to null

- [ ] **Scenario 7**: Literal values are used directly
    - **Given** a `ValueRef` with `literal: true` or `literal: 0.95`
    - **When** the evaluator resolves the reference
    - **Then** the literal value is returned as-is

- [ ] **Scenario 8**: Nested expressions evaluate correctly
    - **Given** a complex expression combining `and`, comparison, and `is-not-null` (as in Section 14.4 confidence threshold example)
    - **When** the evaluator processes it
    - **Then** the nested structure evaluates correctly

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- File: `apps/temporal/src/expression-evaluator.ts`
- No implicit type coercion: comparing a string to a number is always false
- String `contains` is case-sensitive per Section 14.3
- Variable namespace support: `ctx.<key>`, `ctx.<key>.<nestedKey>`, `doc.<field>` (alias for `ctx.documentMetadata.<field>`), `segment.<field>` (alias for `ctx.currentSegment.<field>`)
- CEL expression support is a non-goal for this phase
- Tests must cover all operator types, null handling, nested access, and edge cases
