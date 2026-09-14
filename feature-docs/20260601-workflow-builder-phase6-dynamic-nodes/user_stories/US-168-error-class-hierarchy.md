# US-168: Dynamic-node error class hierarchy (7 typed errors)

**As a** worker engineer building the `dyn.run` activity,
**I want** seven typed error classes that each carry their own structured prefix when serialised into `NodeRunStatus.errorMessage`,
**So that** the Phase 7 agent's revision loop classifies failures by prefix without parsing free text and the existing Phase 4 status surface needs zero changes.

## Acceptance Criteria

- [x] **Scenario 1**: New `errors.ts` exports seven error classes
    - **Given** `apps/temporal/src/dynamic-nodes/errors.ts`
    - **When** the file is read after the change
    - **Then** it exports: `DynamicNodeDeletedError`, `DynamicNodeVersionNotFoundError`, `DynamicNodeHeadMissingError`, `DynamicNodeTimeoutError`, `DynamicNodeStdoutTooLargeError`, `DynamicNodeRuntimeError`, `DynamicNodeOutputInvalidJsonError`, `DynamicNodeOutputShapeError`
    - **And** every class extends a common `DynamicNodeError extends Error` base

- [x] **Scenario 2**: Each error class carries structured data
    - **Given** the error classes
    - **When** instantiated
    - **Then** each carries the data the agent needs to revise: `DynamicNodeDeletedError { slug }`, `DynamicNodeVersionNotFoundError { slug, version }`, `DynamicNodeTimeoutError { slug, versionId, timeoutMs }`, `DynamicNodeStdoutTooLargeError { slug, versionId, capBytes, actualBytes }`, `DynamicNodeRuntimeError { slug, versionId, exitCode, stderrTail }`, `DynamicNodeOutputInvalidJsonError { slug, versionId, stdoutHead }`, `DynamicNodeOutputShapeError { slug, versionId, missingPorts }`

- [x] **Scenario 3**: Each error class has a `toErrorMessage()` method
    - **Given** an error instance
    - **When** `.toErrorMessage()` is called
    - **Then** it returns a string with a structured prefix `[<ClassName>] ` followed by the key facts (e.g. `"[DynamicNodeRuntimeError] exitCode=1\n<stderrTail>"`)
    - **And** the returned string is the value Phase 4's status-update path writes into `NodeRunStatus.errorMessage` (Phase 4 already truncates to 2 KB downstream — this story does NOT truncate)

- [x] **Scenario 4**: Errors are Temporal-serialisable
    - **Given** Temporal's activity-error serialisation
    - **When** a `DynamicNodeRuntimeError` is thrown from an activity
    - **Then** it travels through Temporal back to the workflow with its `name` + `message` + structured payload intact
    - **And** the workflow side's catch handler can `instanceof`-check against the original class (use `@temporalio/activity` error-class registration patterns)

- [x] **Scenario 5**: Unit tests cover prefix + structured payload + instanceof
    - **Given** `errors.spec.ts`
    - **When** the suite runs
    - **Then** tests pass for: `toErrorMessage()` for each class produces the expected prefix + payload string, `instanceof` distinguishes each class from siblings, the common base class catches all

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/temporal/src/dynamic-nodes/errors.ts` — new file
- `apps/temporal/src/dynamic-nodes/errors.spec.ts` — new file
- `apps/temporal/src/dynamic-nodes/index.ts` — barrel exports

## Technical notes

- Per Temporal's docs, custom error classes need a `name` getter override + must be registered via `defaultDataConverter` for cross-process serialisation. Use the existing project's Temporal error pattern (look for prior custom errors in `apps/temporal/src/`).
- The 2 KB truncation lives in Phase 4's `NodeRunStatus.errorMessage` write path. Errors thrown from `dyn.run` (this Milestone C's US-170) carry full payloads; truncation is downstream.
- Five of the seven errors are activity-runtime; two (`Deleted`, `VersionNotFoundError`) are executor-side (thrown before the activity is invoked — US-171). All seven share the same hierarchy + serialisation path.
- After landing: no Vite restart (Temporal-only).
