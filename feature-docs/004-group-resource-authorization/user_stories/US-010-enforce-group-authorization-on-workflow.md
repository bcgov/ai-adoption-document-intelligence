# US-010: Enforce Group Authorization on Workflow Read/Write Operations

**As a** system user,
**I want to** be prevented from reading or modifying Workflows that belong to groups I am not a member of,
**So that** Workflow data is only accessible to authorized group members.

## Acceptance Criteria
- [ ] **Scenario 1**: Member reads a Workflow in their group
    - **Given** a requestor who is a member of group X
    - **And** a Workflow with `group_id` = X exists
    - **When** the requestor fetches the Workflow
    - **Then** the Workflow is returned successfully

- [ ] **Scenario 2**: Non-member attempts to read a Workflow
    - **Given** a requestor who is NOT a member of group X
    - **And** a Workflow with `group_id` = X exists
    - **When** the requestor attempts to fetch the Workflow
    - **Then** the API returns `403 Forbidden`

- [ ] **Scenario 3**: Member updates a Workflow in their group
    - **Given** a requestor who is a member of group X
    - **And** a Workflow with `group_id` = X exists
    - **When** the requestor submits an update for the Workflow
    - **Then** the update is applied successfully

- [ ] **Scenario 4**: Non-member attempts to update a Workflow
    - **Given** a requestor who is NOT a member of group X
    - **When** the requestor attempts to update a Workflow in group X
    - **Then** the API returns `403 Forbidden`

- [ ] **Scenario 5**: Non-member attempts to delete a Workflow
    - **Given** a requestor who is NOT a member of group X
    - **When** the requestor attempts to delete a Workflow in group X
    - **Then** the API returns `403 Forbidden`

- [ ] **Scenario 6**: Unit tests cover all enforcement paths
    - **Given** the enforcement implementation
    - **When** unit tests are run
    - **Then** authorized and unauthorized read, update, and delete cases are covered and pass

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Depends on US-002 (schema), US-006 (identity guard), US-007 (authorization helper)
- Enforcement is applied at the service layer after the Workflow is fetched
- All CRUD operations on Workflow must be covered (read, update, delete); creation is covered by US-008
