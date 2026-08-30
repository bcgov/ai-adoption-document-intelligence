# US-018: Temporal worker validator consumes the catalog

**As a** Temporal worker,
**I want** the execute-time graph validator to consume the catalog Zod
schemas instead of the imperative parameter registry,
**So that** the worker rejects bad parameter shapes at workflow start
with the same vocabulary the editor and backend use.

## Acceptance Criteria

- [x] **Scenario 1**: Temporal validator wires the catalog adapter
    - **Given** `apps/temporal/src/graph-schema-validator.ts`
    - **When** the module is imported
    - **Then** `validateGraphConfig` is invoked with `validateActivityParameters: createCatalogParameterValidator()` from `@ai-di/graph-workflow`

- [x] **Scenario 2**: Temporal-side `activity-parameter-schema-registry.ts` is removed
    - **Given** the temporal `src/` folder
    - **When** the file list is checked
    - **Then** `apps/temporal/src/activity-parameter-schema-registry.ts` no longer exists, and no source file imports from it

- [x] **Scenario 3**: Determinism preserved
    - **Given** the catalog adapter runs Zod's `safeParse` — pure function, no I/O, no `Date.now()`
    - **When** the adapter is invoked twice with the same input
    - **Then** identical results are produced; the comment block at the top of `apps/temporal/src/graph-schema-validator.ts` ("Must be deterministic: no I/O, no Date.now()") remains accurate

- [x] **Scenario 4**: Existing temporal validator test passes
    - **Given** `apps/temporal/src/graph-schema-validator.test.ts`
    - **When** the suite is re-run
    - **Then** all cases pass with the same path conventions; message substrings relaxed where they hard-coded imperative-validator prose

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions

- Mirror of US-017 on the temporal worker side.
- `isRegisteredActivityType` here checks against the worker's actual registry of importable activity functions (`activity-types.ts`), NOT against the catalog. Keep that distinction.
- The Zod library has no I/O — `safeParse` is pure. Determinism comment in the file stays correct.

## Files modified

- `apps/temporal/src/graph-schema-validator.ts` — swap callback source to `createCatalogParameterValidator()`.
- `apps/temporal/src/activity-parameter-schema-registry.ts` — DELETED.
- `apps/temporal/src/graph-schema-validator.test.ts` — relax error-message substring assertions where they hard-coded the imperative validator's prose; paths stay the same.
