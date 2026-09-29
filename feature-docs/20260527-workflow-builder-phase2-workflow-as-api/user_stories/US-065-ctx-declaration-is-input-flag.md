# US-065: Add optional `isInput?: boolean` to `CtxDeclaration` in `@ai-di/graph-workflow`

**As a** workflow author preparing a workflow to be triggered as an API,
**I want** to mark specific `ctx` declarations as caller-supplied inputs,
**So that** the Run panel can derive a precise input schema (just the
fields callers should provide) instead of conflating callee-internal
state with caller-supplied parameters.

## Acceptance Criteria

- [x] **Scenario 1**: `CtxDeclaration` carries an optional `isInput` flag
    - **Given** `packages/graph-workflow/src/types.ts`
    - **When** the file is read
    - **Then** `CtxDeclaration` declares `isInput?: boolean` alongside existing `type`, `description`, `defaultValue`
    - **And** the field is documented inline with a one-line JSDoc explaining its purpose ("Marks this ctx entry as a caller-supplied input; surfaced in the workflow's derived run-spec input schema.")

- [x] **Scenario 2**: Existing workflow configs remain valid
    - **Given** any existing template JSON in `docs-md/graph-workflows/templates/`
    - **When** validated via `validateGraphConfig`
    - **Then** validation succeeds without modification (`isInput` is optional)

- [x] **Scenario 3**: Validator accepts a config with `isInput: true`
    - **Given** a config with at least one `ctx` entry having `isInput: true`
    - **When** validated
    - **Then** no errors are produced for the `isInput` field
    - **And** the validator's existing per-ctx checks (e.g. `type` allowed values) still run

- [x] **Scenario 4**: Package builds + tests pass
    - **Given** the type extension + any new validator tests
    - **When** `npm run build` and `npm test` run in `packages/graph-workflow/`
    - **Then** both succeed with no errors

## Priority
- [ ] High (Must Have)

## Files modified

- `packages/graph-workflow/src/types.ts` — extend `CtxDeclaration` with `isInput?: boolean`
- `packages/graph-workflow/src/validator/validator.test.ts` (or similar existing test file) — add a test confirming `isInput: true` validates cleanly
