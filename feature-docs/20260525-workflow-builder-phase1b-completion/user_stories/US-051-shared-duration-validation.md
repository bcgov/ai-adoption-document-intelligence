# US-051: Lift duration regex into `packages/graph-workflow` + use in validator

**As a** workflow author saving a config,
**I want** invalid Temporal duration strings (`pollUntil.interval`,
`humanGate.timeout`, etc.) to fail save-time validation,
**So that** I learn about typos before runtime.

## Acceptance Criteria

- [ ] **Scenario 1**: Helper in shared package
    - **Given** the existing `duration-validation.ts` in the frontend
    - **When** lifted to `packages/graph-workflow/src/validator/duration.ts`
    - **Then** `isValidTemporalDuration(value: string): boolean` is exported with the same regex `/^(\d+(ms|s|m|h|d))+$/`
    - **And** unit tests cover: empty string, `"5s"`, `"1h30m"`, `"500ms"`, `"-1s"` (invalid), `"5"` (invalid), `"5.5s"` (invalid)

- [ ] **Scenario 2**: Frontend imports from the package
    - **Given** the frontend's `duration-validation.ts`
    - **When** updated
    - **Then** it re-exports the package helper; no logic duplicated. (Other callers are updated to use the package directly.)

- [ ] **Scenario 3**: Validator surfaces errors at duration fields
    - **Given** a graph with `pollUntil.interval: "5"` (invalid)
    - **When** `validateGraphConfig` runs
    - **Then** an error appears at `nodes.<id>.interval` with message "Invalid Temporal duration"

- [ ] **Scenario 4**: Coverage for the four duration fields
    - **Given** the four Temporal duration fields: `pollUntil.interval`, `pollUntil.initialDelay`, `pollUntil.timeout`, `humanGate.timeout`
    - **When** each is set to an invalid string
    - **Then** the validator surfaces an error at the corresponding path

- [ ] **Scenario 5**: Backend + temporal validators inherit automatically
    - **Given** both apps consume `validateGraphConfig` from the shared package
    - **When** this change lands
    - **Then** no app-side change is required (the shared validator's behaviour change is picked up by both)

## Priority
- [x] High (Must Have)

## Files modified

- `packages/graph-workflow/src/validator/duration.ts` — NEW.
- `packages/graph-workflow/src/validator/duration.test.ts` — NEW.
- `packages/graph-workflow/src/validator/validator.ts` — add per-field calls in the `pollUntil` + `humanGate` branches.
- `packages/graph-workflow/src/validator/validator.test.ts` — duration scenarios.
- `apps/frontend/src/features/workflow-builder/settings/control-flow/duration-validation.ts`
  — re-export from the package.
- `packages/graph-workflow/src/index.ts` — re-export `isValidTemporalDuration`.
