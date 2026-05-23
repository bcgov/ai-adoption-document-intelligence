# US-056: Validator tests confirm existing graphs still validate; library metadata is accepted

**As a** workflow author saving a library workflow,
**I want** the shared validator to accept configs with the new
metadata fields,
**So that** library workflows can round-trip through validation
without false negatives.

## Acceptance Criteria

- [ ] **Scenario 1**: Validator accepts a config with `metadata.kind = "library"`
    - **Given** a minimal valid `GraphWorkflowConfig` with `metadata.kind = "library"` + a populated `inputs[]` + `outputs[]`
    - **When** the validator runs against it
    - **Then** validation succeeds with no errors

- [ ] **Scenario 2**: Validator accepts a config with no `metadata.kind`
    - **Given** a minimal valid `GraphWorkflowConfig` without `metadata.kind` set
    - **When** the validator runs
    - **Then** validation succeeds (preserves existing behavior)

- [ ] **Scenario 3**: A new unit test in the validator package covers both
    - **Given** the validator test suite in `packages/graph-workflow/src/validator/`
    - **When** the tests are run
    - **Then** at least one new test asserts behavior for `metadata.kind = "library"` + populated `inputs[]` / `outputs[]`

- [ ] **Scenario 4**: All existing validator tests continue to pass
    - **Given** the unmodified validator behavior on existing fields
    - **When** `npm test` is run in `packages/graph-workflow/`
    - **Then** all suites pass (217+ tests as of Phase 1B close)

## Notes

The Phase 2 Track 1 work doesn't add deep validation of the
`metadata.inputs[]` / `metadata.outputs[]` contents (e.g., that the
declared `path` refers to a real ctx key). That's deferred to Phase 3
when typed I/O lands. The validator just has to accept the shape.

## Priority
- [ ] Medium

## Files modified

- `packages/graph-workflow/src/validator/validator.test.ts` (or a new sibling test file) — add the new test cases
