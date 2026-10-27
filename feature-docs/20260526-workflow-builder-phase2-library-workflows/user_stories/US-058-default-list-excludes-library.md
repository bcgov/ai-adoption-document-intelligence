# US-058: Default (unfiltered) list excludes library workflows; backend unit tests cover all three paths

**As a** user viewing the regular workflows list,
**I want** library workflows to NOT appear in the unfiltered list,
**So that** library workflows stay separate from the main workflows
list and the list UI behaves the way it always has.

## Acceptance Criteria

- [ ] **Scenario 1**: Unfiltered list excludes libraries
    - **Given** a backend DB containing N `primary` workflows and M `library` workflows
    - **When** `GET /api/workflows` is called with no `kind` param
    - **Then** the response contains only the N `primary` workflows (M library workflows are filtered out)
    - **And** the default behavior also continues to behave normally for the `includeBenchmarkCandidates=true` flow (i.e., the kind filter is orthogonal to the benchmark-candidate flag)

- [ ] **Scenario 2**: `kind=library` returns only libraries
    - **Given** the same DB state
    - **When** `GET /api/workflows?kind=library` is called
    - **Then** the response contains only the M library workflows

- [ ] **Scenario 3**: `kind=workflow` returns only primary workflows
    - **Given** the same DB state
    - **When** `GET /api/workflows?kind=workflow` is called
    - **Then** the response contains only the N primary workflows

- [ ] **Scenario 4**: Test coverage
    - **Given** the backend unit test suite
    - **When** `npm test` is run in `apps/backend-services`
    - **Then** new tests cover Scenarios 1, 2, and 3 above

## Priority
- [ ] High (Must Have)

## Files modified

- `apps/backend-services/src/workflow/workflow.service.ts` — adjust the default Prisma `where` clause to exclude `workflow_kind = library` when no `kind` filter is provided
- `apps/backend-services/src/workflow/workflow.service.spec.ts` — add tests for the three filter paths
- `apps/backend-services/src/workflow/workflow.controller.spec.ts` — add controller-level coverage if needed
