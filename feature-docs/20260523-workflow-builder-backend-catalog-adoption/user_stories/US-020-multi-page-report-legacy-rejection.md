# US-020: Regression — backend rejects the legacy flat `validateFields` shape

**As a** maintainer of the catalog/validator pipeline,
**I want** a pinned regression test on the backend that builds a graph
with the pre-`e99da4ef` flat `validateFields` rule shape and asserts
save-time rejection,
**So that** any future drift between the catalog and the runtime
`validateFields` activity is caught the way the 2026-05-23 walkthrough
caught it — at save, not in production.

## Acceptance Criteria

- [x] **Scenario 1**: Flat `{ operation, fields, equals }` rule fails save-time validation
    - **Given** a graph with a single `document.validateFields` node whose `parameters.rules[0]` is `{ type: "arithmetic", name: "test", operation: "sum", fields: ["a","b"], equals: "c", operator: "equals", fieldType: "currency" }` (legacy flat shape — `operation`/`fields`/`equals` at the top level instead of nested under `expression`)
    - **When** `validateGraphConfig` is called
    - **Then** `result.valid` is `false` and at least one error path matches `nodes.<id>.parameters.rules.0.expression` (or a sub-path of it)

- [x] **Scenario 2**: Legacy `operator: "exact"` fails save-time validation
    - **Given** a graph with a `document.validateFields` node whose `parameters.rules[0]` uses `operator: "exact"` (instead of `"equals"`)
    - **When** `validateGraphConfig` is called
    - **Then** `result.valid` is `false` and an error path matches `nodes.<id>.parameters.rules.0.operator`

- [x] **Scenario 3**: The fixed shape passes
    - **Given** a graph with a `document.validateFields` node whose `parameters.rules[0]` is the **post-e99da4ef** nested-`expression` shape with `operator: "equals"`
    - **When** `validateGraphConfig` is called
    - **Then** `result.valid` is `true`

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions

- This test is the backend-side companion to `packages/graph-workflow/src/catalog/activities/document-validate-fields.test.ts`. The catalog test proves the schema; this test proves the schema is wired through the backend validator.
- Add as a new `describe` block in `apps/backend-services/src/workflow/graph-schema-validator.spec.ts` titled `document.validateFields legacy-shape rejection`.

## Files modified

- `apps/backend-services/src/workflow/graph-schema-validator.spec.ts` — new describe block with three cases above.
