# US-013: Filter Workflows List by Active Group

**As a** user viewing the workflows list,
**I want to** see only workflows that belong to my active group,
**So that** I can focus on workflows relevant to my current group context without noise from other groups.

## Acceptance Criteria
- [x] **Scenario 1**: Workflows are scoped to the active group
    - **Given** the user has an `activeGroup` set in `GroupContext`
    - **When** `useWorkflows` fetches the workflow list
    - **Then** the request includes `groupId=<activeGroup.id>` as a query parameter and only workflows for that group are returned

- [x] **Scenario 2**: Workflow list refreshes when active group changes
    - **Given** the user switches their active group via the header selector
    - **When** `GroupContext` updates `activeGroup`
    - **Then** `useWorkflows` re-fetches and displays only workflows for the new active group (i.e., `activeGroup.id` is part of the React Query `queryKey`)

- [x] **Scenario 3**: Backend accepts and validates optional `groupId` query param
    - **Given** a request to `GET /api/workflows?groupId=<uuid>`
    - **When** the controller receives the request
    - **Then** it calls `identityCanAccessGroup` with the provided `groupId` before filtering; if the identity is not a member, a `403 Forbidden` is returned

- [x] **Scenario 4**: Backend behaviour is unchanged when `groupId` is omitted
    - **Given** a request to `GET /api/workflows` with no `groupId` query param
    - **When** the controller receives the request
    - **Then** it falls back to returning all workflows across all groups the identity belongs to (existing behaviour)

- [x] **Scenario 5**: Empty list shown when active group has no workflows
    - **Given** the active group has no workflows
    - **When** the Workflows page renders
    - **Then** the empty-state message is shown with no error

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- **Backend:** Add an optional `groupId` query param (`@Query('groupId')`) to `WorkflowController.getWorkflows`. When present, call `identityCanAccessGroup` and pass only `[groupId]` to `WorkflowService.getGroupWorkflows`; when absent, pass the full `groupIds` array as today.
- **Frontend:** `useWorkflows` must consume `useGroup()` and include `activeGroup?.id` in the query key and query URL. Note that `useCreateWorkflow` already uses `useGroup()` — this change extends group-awareness to the list query.
- `useWorkflow` (GET by id) is **not** in scope — a single workflow is already scoped by its stored `group_id` and validated on access.
- Backend unit tests for `getWorkflows` must cover both the filtered and unfiltered paths.
- Frontend tests for `useWorkflows` must be updated to mock `GroupContext`.
