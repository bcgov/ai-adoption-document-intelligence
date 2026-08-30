# US-076: Extend `ChildWorkflowNode.workflowRef.library` with optional `version?: number`

**As a** workflow author composing library workflows,
**I want** to pin a `childWorkflow` reference to a specific library
version,
**So that** my parent workflow's behaviour stays reproducible even
after the library's head moves forward.

## Acceptance Criteria

- [x] **Scenario 1**: Library variant grows an optional `version?: number` field
    - **Given** `packages/graph-workflow/src/types.ts`
    - **When** the file is read
    - **Then** `ChildWorkflowNode.workflowRef` library variant is `{ type: "library"; workflowId: string; version?: number }`
    - **And** the field has a one-line JSDoc explaining "Optional. When set, pins the child execution to this specific `WorkflowVersion.versionNumber`. When omitted, the runtime resolves to the library's head."

- [x] **Scenario 2**: Existing configs without `version` still validate
    - **Given** any existing template JSON that uses `workflowRef: { type: "library", workflowId }`
    - **When** validated via `validateGraphConfig`
    - **Then** validation succeeds without modification

- [x] **Scenario 3**: Validator accepts a config with `version: 3`
    - **Given** a `childWorkflow` node with `workflowRef: { type: "library", workflowId: "abc", version: 3 }`
    - **When** validated
    - **Then** no errors are produced for the `version` field
    - **And** all other `childWorkflow` checks (workflowId presence, inline-vs-library discrimination) still run

- [x] **Scenario 4**: Package builds + tests pass
    - **Given** the type extension + the new validator test
    - **When** `npm run build` and `npm test` run in `packages/graph-workflow/`
    - **Then** both succeed with no errors

## Priority
- [ ] High (Must Have)

## Files modified

- `packages/graph-workflow/src/types.ts` — extend `ChildWorkflowNode.workflowRef` library variant with `version?: number`
- `packages/graph-workflow/src/validator/validator.test.ts` — add a test asserting both shapes (with and without `version`) validate cleanly
