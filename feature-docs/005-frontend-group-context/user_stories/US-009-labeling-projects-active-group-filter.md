# US-009: Filter Labeling Projects by Active Group

**As a** user viewing my labeling projects,
**I want to** see only the projects that belong to my active group,
**So that** I can focus on work relevant to my current group context without noise from other groups.

## Acceptance Criteria
- [x] **Scenario 1**: Projects are scoped to the active group
    - **Given** the user has an `activeGroup` set in `GroupContext`
    - **When** the `useProjects` hook fetches labeling projects
    - **Then** the request includes `group_id=<activeGroup.id>` as a query parameter and only projects for that group are returned

- [x] **Scenario 2**: Project list refreshes when active group changes
    - **Given** the user switches their active group via the header selector
    - **When** `GroupContext` updates `activeGroup`
    - **Then** `useProjects` re-fetches and displays only projects for the new active group (i.e., `activeGroup.id` is part of the React Query `queryKey`)

- [x] **Scenario 3**: Backend accepts and validates optional `group_id` query param
    - **Given** a request to `GET /api/labeling/projects?group_id=<uuid>`
    - **When** the controller receives the request
    - **Then** it calls `identityCanAccessGroup` with the provided `group_id` before filtering; if the identity is not a member, a `403 Forbidden` is returned

- [x] **Scenario 4**: Backend behaviour is unchanged when `group_id` is omitted
    - **Given** a request to `GET /api/labeling/projects` with no `group_id` query param
    - **When** the controller receives the request
    - **Then** it falls back to returning all projects across all groups the identity belongs to (existing behaviour)

- [x] **Scenario 5**: Empty list shown when active group has no projects
    - **Given** the active group has no labeling projects
    - **When** the Project List page renders
    - **Then** the empty-state message is shown with no error

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- **Backend:** Add an optional `group_id` query param (`@Query('group_id')`) to `LabelingController.getProjects`. When present, call `identityCanAccessGroup` and pass only `[group_id]` to `LabelingService.getProjects`; when absent, pass the full `groupIds` array as today.
- **Frontend:** `useProjects` must consume `useGroup()` and include `activeGroup?.id` in the query key and query URL.
- The frontend `useProjects` hook currently queries with a `userId` filter that was a workaround — this should be removed in favour of the `group_id` filter.
- Backend unit tests for the `getProjects` controller method must cover both the filtered and unfiltered paths.
