# US-012: Filter Documents List by Active Group

**As a** user viewing the documents list,
**I want to** see only documents that belong to my active group,
**So that** I can focus on documents relevant to my current group context without noise from other groups.

## Acceptance Criteria
- [ ] **Scenario 1**: Documents are scoped to the active group
    - **Given** the user has an `activeGroup` set in `GroupContext`
    - **When** `useDocuments` fetches the document list
    - **Then** the request includes `group_id=<activeGroup.id>` as a query parameter and only documents for that group are returned

- [ ] **Scenario 2**: Document list refreshes when active group changes
    - **Given** the user switches their active group via the header selector
    - **When** `GroupContext` updates `activeGroup`
    - **Then** `useDocuments` re-fetches and displays only documents for the new active group (i.e., `activeGroup.id` is part of the React Query `queryKey`)

- [ ] **Scenario 3**: Backend accepts and validates optional `group_id` query param
    - **Given** a request to `GET /api/documents?group_id=<uuid>`
    - **When** the controller receives the request
    - **Then** it calls `identityCanAccessGroup` with the provided `group_id` before filtering; if the identity is not a member, a `403 Forbidden` is returned

- [ ] **Scenario 4**: Backend behaviour is unchanged when `group_id` is omitted
    - **Given** a request to `GET /api/documents` with no `group_id` query param
    - **When** the controller receives the request
    - **Then** it falls back to returning all documents across all groups the identity belongs to (existing behaviour)

- [ ] **Scenario 5**: Empty list shown when active group has no documents
    - **Given** the active group has no documents
    - **When** the Documents page renders
    - **Then** the empty-state message is shown with no error

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- **Backend:** Add an optional `group_id` query param (`@Query('group_id')`) to `DocumentController.getAllDocuments`. When present, call `identityCanAccessGroup` and pass only `[group_id]` to the database query; when absent, pass the full `groupIds` array as today.
- **Frontend:** `useDocuments` must consume `useGroup()` and include `activeGroup?.id` in the query key and query URL. The `enabled` option should remain unchanged (query runs regardless of group being present; when `activeGroup` is `null` no param is sent and all-groups fallback applies — unless a stricter guard is preferred).
- Note the existing TODO comment in `DocumentController.getAllDocuments` about performance — this change does not address that but should not worsen it.
- Backend unit tests for `getAllDocuments` must cover both the filtered and unfiltered paths.
- Frontend tests for `useDocuments` must be updated to mock `GroupContext`.
