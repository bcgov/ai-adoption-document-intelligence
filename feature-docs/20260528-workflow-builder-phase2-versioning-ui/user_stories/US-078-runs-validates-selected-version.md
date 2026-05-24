# US-078: `POST /api/workflows/:id/runs` validates `initialCtx` against the selected version's derived schema

**As a** Run-drawer user starting a workflow with `workflowVersionId`
set to an older version,
**I want** the backend to validate my payload against *that* version's
input schema (not head's),
**So that** I'm not blocked by a head-only required input when running
an older version that didn't have it.

## Acceptance Criteria

- [ ] **Scenario 1**: `initialCtx` validated against the selected version's schema
    - **Given** head requires `foo: string` (added in head, absent in v2)
    - **When** `POST /:id/runs` is called with `{ workflowVersionId: "<v2id>", initialCtx: {} }` (no `foo`)
    - **Then** the response is 201 (NOT 400) — v2's schema doesn't require `foo`
    - **And** the Temporal run starts against v2's config

- [ ] **Scenario 2**: Missing-required error still raised relative to selected version
    - **Given** v2 requires `customerId: string`
    - **When** `POST /:id/runs` is called with `{ workflowVersionId: "<v2id>", initialCtx: {} }` (no `customerId`)
    - **Then** the response is 400 with `customerId` in the error list

- [ ] **Scenario 3**: Default behaviour unchanged when `workflowVersionId` omitted
    - **Given** a body without `workflowVersionId`
    - **When** `POST /:id/runs` is called
    - **Then** validation runs against head's schema (Track 2 regression coverage)

- [ ] **Scenario 4**: Vitest + supertest coverage
    - **Given** the controller spec
    - **When** `npm test` runs
    - **Then** Scenarios 1, 2, and 3 each have a corresponding test case

## Priority
- [ ] High (Must Have)

## Files modified

- `apps/backend-services/src/workflow/workflow.controller.ts` — `startRun` already loads the resolved `wf.config` via `resolveLineageAndVersion(id, workflowVersionId)`; verify (and fix if needed) that `deriveInputSchema(wf.config)` uses the resolved config rather than head's
- `apps/backend-services/src/workflow/workflow.controller.spec.ts` — Scenarios 1–3

## Notes

- This story is bugfix-shaped — Track 2's `startRun` likely already does the right thing because it uses `wf.config` from `resolveLineageAndVersion`. The story exists to add explicit regression coverage and confirm the code path is correct.
