# US-012: Enforce Group Authorization on LabelingDocument Read/Write Operations

**As a** system user,
**I want to** be prevented from reading or modifying LabelingDocuments that belong to groups I am not a member of,
**So that** LabelingDocument data is only accessible to authorized group members.

## Acceptance Criteria
- [x] **Scenario 1**: Member reads a LabelingDocument in their group
    - **Given** a requestor who is a member of group X
    - **And** a LabelingDocument with `group_id` = X exists
    - **When** the requestor fetches the LabelingDocument
    - **Then** the LabelingDocument is returned successfully

- [x] **Scenario 2**: Non-member attempts to read a LabelingDocument
    - **Given** a requestor who is NOT a member of group X
    - **And** a LabelingDocument with `group_id` = X exists
    - **When** the requestor attempts to fetch the LabelingDocument
    - **Then** the API returns `403 Forbidden`

- [x] **Scenario 3**: Member updates a LabelingDocument in their group
    - **Given** a requestor who is a member of group X
    - **And** a LabelingDocument with `group_id` = X exists
    - **When** the requestor submits an update for the LabelingDocument
    - **Then** the update is applied successfully

- [x] **Scenario 4**: Non-member attempts to update a LabelingDocument
    - **Given** a requestor who is NOT a member of group X
    - **When** the requestor attempts to update a LabelingDocument in group X
    - **Then** the API returns `403 Forbidden`

- [x] **Scenario 5**: Non-member attempts to delete a LabelingDocument
    - **Given** a requestor who is NOT a member of group X
    - **When** the requestor attempts to delete a LabelingDocument in group X
    - **Then** the API returns `403 Forbidden`

- [x] **Scenario 6**: Unit tests cover all enforcement paths
    - **Given** the enforcement implementation
    - **When** unit tests are run
    - **Then** authorized and unauthorized read, update, and delete cases are covered and pass

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Depends on US-004 (schema), US-006 (identity guard), US-007 (authorization helper)
- Enforcement is applied at the service layer after the LabelingDocument is fetched
- All CRUD operations on LabelingDocument must be covered (read, update, delete); creation is covered by US-008
