# US-009: Enforce Group Authorization on Document Read/Write Operations

**As a** system user,
**I want to** be prevented from reading or modifying Documents that belong to groups I am not a member of,
**So that** Document data is only accessible to authorized group members.

## Acceptance Criteria
- [ ] **Scenario 1**: Member reads a Document in their group
    - **Given** a requestor who is a member of group X
    - **And** a Document with `group_id` = X exists
    - **When** the requestor fetches the Document
    - **Then** the Document is returned successfully

- [ ] **Scenario 2**: Non-member attempts to read a Document
    - **Given** a requestor who is NOT a member of group X
    - **And** a Document with `group_id` = X exists
    - **When** the requestor attempts to fetch the Document
    - **Then** the API returns `403 Forbidden`

- [ ] **Scenario 3**: Member updates a Document in their group
    - **Given** a requestor who is a member of group X
    - **And** a Document with `group_id` = X exists
    - **When** the requestor submits an update for the Document
    - **Then** the update is applied successfully

- [ ] **Scenario 4**: Non-member attempts to update a Document
    - **Given** a requestor who is NOT a member of group X
    - **When** the requestor attempts to update a Document in group X
    - **Then** the API returns `403 Forbidden`

- [ ] **Scenario 5**: Non-member attempts to delete a Document
    - **Given** a requestor who is NOT a member of group X
    - **When** the requestor attempts to delete a Document in group X
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
- Depends on US-001 (schema), US-006 (identity guard), US-007 (authorization helper)
- Enforcement is applied at the service layer after the Document is fetched
- All CRUD operations on Document must be covered (read, update, delete); creation is covered by US-008
- `ReviewSession` sub-resource inherits group enforcement from `Document`; see US-013
