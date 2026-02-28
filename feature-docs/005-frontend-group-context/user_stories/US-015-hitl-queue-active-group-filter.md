# US-015: Filter HITL Queue by Active Group

**As a** user reviewing documents in the HITL queue,
**I want to** see only queue items and stats that belong to my active group,
**So that** I can focus on review work relevant to my current group context without noise from other groups.

## Background
`GET /api/hitl/queue`, `GET /api/hitl/queue/stats`, and `GET /api/hitl/analytics` already correctly scope results to all groups the user belongs to via `getIdentityGroupIds`. The all-groups base behaviour does **not** need to change. The only addition needed is an optional `group_id` query parameter on each endpoint so the frontend can narrow results to the single active group.

## Acceptance Criteria
- [x] **Scenario 1**: HITL queue is scoped to the active group
    - **Given** the user has an `activeGroup` set in `GroupContext`
    - **When** `useReviewQueue` fetches the queue
    - **Then** the request includes `group_id=<activeGroup.id>` as a query parameter and only queue items for that group are returned

- [x] **Scenario 2**: HITL queue stats are scoped to the active group
    - **Given** the user has an `activeGroup` set in `GroupContext`
    - **When** `useReviewQueue` fetches queue stats
    - **Then** the request includes `group_id=<activeGroup.id>` as a query parameter and stats reflect only that group's documents

- [x] **Scenario 3**: Queue and stats refresh when active group changes
    - **Given** the user switches their active group via the header selector
    - **When** `GroupContext` updates `activeGroup`
    - **Then** both `queueQuery` and `statsQuery` re-fetch and display data for the new active group (i.e., `activeGroup.id` is part of each React Query `queryKey`)

- [x] **Scenario 4**: Backend accepts and validates optional `group_id` on `GET /api/hitl/queue`
    - **Given** a request to `GET /api/hitl/queue?group_id=<uuid>`
    - **When** the controller receives the request
    - **Then** it calls `identityCanAccessGroup` with the provided `group_id` before filtering; if the identity is not a member, a `403 Forbidden` is returned

- [x] **Scenario 5**: Backend behaviour is unchanged on `GET /api/hitl/queue` when `group_id` is omitted
    - **Given** a request to `GET /api/hitl/queue` with no `group_id` query param
    - **When** the controller receives the request
    - **Then** it returns all queue items across all groups the identity belongs to (existing correct behaviour)

- [x] **Scenario 6**: Backend accepts and validates optional `group_id` on `GET /api/hitl/queue/stats`
    - **Given** a request to `GET /api/hitl/queue/stats?group_id=<uuid>`
    - **When** the controller receives the request
    - **Then** it calls `identityCanAccessGroup` with the provided `group_id` before filtering; if the identity is not a member, a `403 Forbidden` is returned

- [x] **Scenario 7**: Backend behaviour is unchanged on `GET /api/hitl/queue/stats` when `group_id` is omitted
    - **Given** a request to `GET /api/hitl/queue/stats` with no `group_id` query param
    - **When** the controller receives the request
    - **Then** it returns stats across all groups the identity belongs to (existing correct behaviour)

- [x] **Scenario 8**: Backend accepts and validates optional `group_id` on `GET /api/hitl/analytics`
    - **Given** a request to `GET /api/hitl/analytics?group_id=<uuid>`
    - **When** the controller receives the request
    - **Then** it calls `identityCanAccessGroup` with the provided `group_id` before filtering; if the identity is not a member, a `403 Forbidden` is returned

- [x] **Scenario 9**: Empty queue shown when active group has no items requiring review
    - **Given** the active group has no documents pending review
    - **When** the HITL queue page renders
    - **Then** the empty-state message is shown with no error

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- **Backend — queue and stats:** Add an optional `group_id` query param to `QueueFilterDto` and to `HitlController.getQueueStats`. When present, call `identityCanAccessGroup` and pass only `[group_id]` to the respective service method; when absent, retain the current `getIdentityGroupIds` lookup unchanged.
- **Backend — analytics:** Add an optional `group_id` query param to `HitlController.getAnalytics` following the same pattern. No frontend hook exists for analytics yet; this change is backend-only for now.
- **Frontend:** `useReviewQueue` must consume `useGroup()` from `GroupContext` and include `activeGroup?.id` in both the `queueQuery` and `statsQuery` query keys and URLs. The `QueueFilters` interface must be extended to include the optional `group_id` field.
- HITL session hooks (`startSession`, `skipSession`, `getSession`, `getSessionCorrections`) are **not** in scope — those operate on individual sessions already scoped by their document's `group_id`.
- Backend unit tests for `getQueue`, `getQueueStats`, and `getAnalytics` must cover both the filtered and unfiltered paths.
- Frontend tests for `useReviewQueue` must be updated to mock `GroupContext`.
