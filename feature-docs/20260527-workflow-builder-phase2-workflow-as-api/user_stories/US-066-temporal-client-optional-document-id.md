# US-066: Refactor `TemporalClientService.startGraphWorkflow()` to accept optional `documentId`

**As a** developer triggering a workflow that has no associated document,
**I want** to call the Temporal client without a real document id,
**So that** non-document workflows (library workflows, dev test runs)
can be started from the new `/api/workflows/:id/runs` endpoint without
synthesizing a fake document upstream.

## Acceptance Criteria

- [ ] **Scenario 1**: `documentId` becomes optional in the method signature
    - **Given** `apps/backend-services/src/temporal/temporal-client.service.ts`
    - **When** `startGraphWorkflow` is inspected
    - **Then** the `documentId` parameter is typed `string | undefined`
    - **And** all existing callers that pass a real `documentId` still typecheck

- [ ] **Scenario 2**: Doc-specific ctx seeding is skipped when `documentId` is absent
    - **Given** `documentId === undefined`
    - **When** `startGraphWorkflow` builds `initialCtx`
    - **Then** the doc-only keys (`documentId`, `blobKey`, `fileName`, `fileType`, `contentType`, `documentMetadata`, `templateModelId`) are omitted
    - **And** only the caller-supplied ctx overrides are present in the final `initialCtx`
    - **And** the Temporal workflow id is generated using a synthetic prefix (e.g. `graph-workflow-adhoc-<uuid>`) instead of `graph-workflow-<documentId>`

- [ ] **Scenario 3**: Existing doc-trigger path is unchanged
    - **Given** the OCR-document trigger calling `startGraphWorkflow(documentId, …)`
    - **When** the call runs against the refactored service
    - **Then** the resulting Temporal workflow receives the same `initialCtx` it received before (regression for doc-specific seeding)
    - **And** the Temporal workflow id format is the same as before (`graph-workflow-<documentId>` or whatever the existing format is)

- [ ] **Scenario 4**: Unit tests cover both paths
    - **Given** an updated Vitest spec for `temporal-client.service.ts`
    - **When** `npm test` runs in `apps/backend-services`
    - **Then** there are at least two new test cases: one with `documentId` (verifies the seed keys are present), one without (verifies they are absent and the workflow id uses the synthetic prefix)
    - **And** all existing tests still pass

## Priority
- [ ] High (Must Have)

## Files modified

- `apps/backend-services/src/temporal/temporal-client.service.ts` — make `documentId` optional; gate the doc-seeding block on its presence; switch the workflow-id prefix when absent
- `apps/backend-services/src/temporal/temporal-client.service.spec.ts` (or the existing equivalent) — add the two new test cases
- Any callsite that passes `documentId!` non-null assertion may stay as-is; **do not** widen the type of existing callers downstream

## Notes

- The `documentId?: string` typing is the cleanest signal that the field is optional. Don't introduce a separate "ad-hoc" method.
- Per CLAUDE.md, no backwards-compatibility shims — change in place.
