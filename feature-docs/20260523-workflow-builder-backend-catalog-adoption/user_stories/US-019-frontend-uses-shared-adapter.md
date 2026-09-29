# US-019: Frontend `useGraphValidation` consumes the shared adapter

**As a** workflow-builder maintainer,
**I want** the frontend's debounced validation hook to consume the same
shared catalog adapter as the backend and temporal validators,
**So that** the "walk Zod issues into GraphValidationError" logic lives
in exactly one place.

## Acceptance Criteria

- [x] **Scenario 1**: Hook imports the shared adapter
    - **Given** `apps/frontend/src/features/workflow-builder/validation/useGraphValidation.ts`
    - **When** the module is inspected
    - **Then** the inlined `validateActivityParameters` arrow function is replaced by a single call to `createCatalogParameterValidator()` (or a module-scoped const initialized from it)

- [x] **Scenario 2**: Editor behavior unchanged on a valid `multi-page-report-workflow.json`
    - **Given** the editor is open on the multi-page-report template
    - **When** the user has not touched any node
    - **Then** the validation drawer's error count is 0 (same as before; the catalog is unchanged for this case)

- [x] **Scenario 3**: Per-node bucketing still works
    - **Given** a node has a parameter that violates its Zod schema
    - **When** validation runs
    - **Then** the error appears in `errorsByNode` under the right node id (the `nodeIdFromPath` parser still extracts `nodes.<id>` from the path)

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions

- The shared adapter from US-015 has the same signature as the current inlined arrow function and produces the same error shape, so this is a pure refactor.
- The `useEffect` continues to debounce; only the inlined adapter is replaced.

## Files modified

- `apps/frontend/src/features/workflow-builder/validation/useGraphValidation.ts` — replace inlined adapter with the shared one.
