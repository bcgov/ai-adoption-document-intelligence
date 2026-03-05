# US-014: Filter Classifiers List by Active Group

**As a** user viewing the classifier models page,
**I want to** see only classifiers that belong to my active group,
**So that** I can focus on classifiers relevant to my current group context without noise from other groups.

## Acceptance Criteria
- [x] **Scenario 1**: Classifiers are scoped to the active group
    - **Given** the user has an `activeGroup` set in `GroupContext`
    - **When** `useClassifier` fetches the classifiers list
    - **Then** the request includes `group_id=<activeGroup.id>` as a query parameter and only classifiers for that group are returned

- [x] **Scenario 2**: Classifier list refreshes when active group changes
    - **Given** the user switches their active group via the header selector
    - **When** `GroupContext` updates `activeGroup`
    - **Then** `getClassifiers` re-fetches and displays only classifiers for the new active group (i.e., `activeGroup.id` is part of the React Query `queryKey`)

- [x] **Scenario 3**: Backend accepts and validates optional `group_id` query param
    - **Given** a request to `GET /api/azure/classifier?group_id=<uuid>`
    - **When** the controller receives the request
    - **Then** it calls `identityCanAccessGroup` with the provided `group_id` before filtering; if the identity is not a member, a `403 Forbidden` is returned

- [x] **Scenario 4**: Backend behaviour is unchanged when `group_id` is omitted
    - **Given** a request to `GET /api/azure/classifier` with no `group_id` query param
    - **When** the controller receives the request
    - **Then** it falls back to returning all classifiers across all groups the identity belongs to (existing behaviour via `getUsersGroups`)

- [x] **Scenario 5**: Empty list shown when active group has no classifiers
    - **Given** the active group has no classifier models
    - **When** the Classifier page renders
    - **Then** the empty-state message is shown with no error

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- **Backend:** Add an optional `group_id` query param (`@Query('group_id')`) to `AzureController.getClassifiers`. When present, call `identityCanAccessGroup` and pass only `[group_id]` to `DatabaseService.getClassifierModelsForGroups`; when absent, retain the current `getUsersGroups(userId)` lookup and pass all group IDs.
- **Frontend:** The `getClassifiers` query in `useClassifier` must consume `useGroup()` from `GroupContext` and include `activeGroup?.id` in the query key and query URL.
- `useClassifier` for individual classifier read/update/delete operations is **not** in scope — those are already scoped by the classifier model's own `group_id`.
- Backend unit tests for `getClassifiers` must cover both the filtered and unfiltered paths.
- Frontend tests for `useClassifier` must be updated to mock `GroupContext`.
