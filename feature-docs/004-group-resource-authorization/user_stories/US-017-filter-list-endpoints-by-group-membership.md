# US-017: Filter List and Aggregate Endpoints by Group Membership

**As a** system user,
**I want to** only see resources and data from groups I belong to when using list or aggregate endpoints,
**So that** I cannot discover or read data owned by groups I am not a member of.

## Acceptance Criteria

### GET /api/documents
- [x] **Scenario 1**: Requestor only receives documents from their groups
    - **Given** a requestor who is a member of groups X and Y
    - **And** documents exist in groups X, Y, and Z
    - **When** the requestor calls `GET /api/documents`
    - **Then** only documents in groups X and Y are returned; group Z documents are excluded

- [x] **Scenario 2**: API key requestor only receives documents from their group
    - **Given** an API key scoped to group X
    - **And** documents exist in groups X and Y
    - **When** the requestor calls `GET /api/documents`
    - **Then** only documents in group X are returned

### GET /api/workflows
- [x] **Scenario 3**: Requestor only receives workflows from their groups
    - **Given** a requestor who is a member of group X
    - **And** workflows exist in groups X and Y
    - **When** the requestor calls `GET /api/workflows`
    - **Then** only workflows in group X are returned

### GET /api/labeling/projects
- [x] **Scenario 4**: Requestor only receives labeling projects from their groups
    - **Given** a requestor who is a member of group X
    - **And** labeling projects exist in groups X and Y
    - **When** the requestor calls `GET /api/labeling/projects`
    - **Then** only projects in group X are returned

### GET /api/hitl/queue and GET /api/hitl/queue/stats
- [x] **Scenario 5**: HITL queue is filtered to the requestor's groups
    - **Given** a requestor who is a member of group X
    - **And** review sessions exist for documents in groups X and Y
    - **When** the requestor calls `GET /api/hitl/queue` or `GET /api/hitl/queue/stats`
    - **Then** only sessions/counts belonging to group X documents are included

### GET /api/hitl/analytics
- [x] **Scenario 6**: HITL analytics are filtered to the requestor's groups
    - **Given** a requestor who is a member of group X
    - **When** the requestor calls `GET /api/hitl/analytics`
    - **Then** only analytics data for group X documents and sessions is returned

- [x] **Scenario 7**: Unit tests cover group-scoped filtering for all list endpoints
    - **Given** the group-filtering implementation
    - **When** unit tests are run
    - **Then** all list endpoints correctly include resources from the requestor's groups and exclude resources from non-member groups

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Depends on US-006 (identity guard) and US-007 (authorization helper pattern)
- For JWT users, determine the set of group IDs the user belongs to via `user_group` table, then filter queries using `WHERE group_id IN (...)
- For API key users, filter by the key's single `group_id`
- Database queries should be updated to accept an optional `groupIds` filter parameter rather than querying all and filtering in application code
- Affected endpoints and their current locations:
  - `GET /api/documents` → `DocumentController.getAllDocuments`
  - `GET /api/workflows` → `WorkflowController.getWorkflows`
  - `GET /api/labeling/projects` → `LabelingController.getProjects`
  - `GET /api/hitl/queue` → `HitlController.getQueue`
  - `GET /api/hitl/queue/stats` → `HitlController.getQueueStats`
  - `GET /api/hitl/analytics` → `HitlController.getAnalytics`
- The `WorkflowController.getWorkflows` currently filters by `userId`; this filter should be replaced (or augmented) to filter by group membership instead, since `group_id` is now the access-control boundary
