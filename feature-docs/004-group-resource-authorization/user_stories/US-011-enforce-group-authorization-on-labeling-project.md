# US-011: Enforce Group Authorization on LabelingProject Read/Write Operations

**As a** system user,
**I want to** be prevented from reading or modifying LabelingProjects that belong to groups I am not a member of,
**So that** LabelingProject data is only accessible to authorized group members.

## Acceptance Criteria
- [ ] **Scenario 1**: Member reads a LabelingProject in their group
    - **Given** a requestor who is a member of group X
    - **And** a LabelingProject with `group_id` = X exists
    - **When** the requestor fetches the LabelingProject
    - **Then** the LabelingProject is returned successfully

- [ ] **Scenario 2**: Non-member attempts to read a LabelingProject
    - **Given** a requestor who is NOT a member of group X
    - **And** a LabelingProject with `group_id` = X exists
    - **When** the requestor attempts to fetch the LabelingProject
    - **Then** the API returns `403 Forbidden`

- [ ] **Scenario 3**: Member updates a LabelingProject in their group
    - **Given** a requestor who is a member of group X
    - **And** a LabelingProject with `group_id` = X exists
    - **When** the requestor submits an update for the LabelingProject
    - **Then** the update is applied successfully

- [ ] **Scenario 4**: Non-member attempts to update a LabelingProject
    - **Given** a requestor who is NOT a member of group X
    - **When** the requestor attempts to update a LabelingProject in group X
    - **Then** the API returns `403 Forbidden`

- [ ] **Scenario 5**: Non-member attempts to delete a LabelingProject
    - **Given** a requestor who is NOT a member of group X
    - **When** the requestor attempts to delete a LabelingProject in group X
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
- Depends on US-003 (schema), US-006 (identity guard), US-007 (authorization helper)
- Enforcement is applied at the service layer after the LabelingProject is fetched
- All CRUD operations on LabelingProject must be covered (read, update, delete); creation is covered by US-008
- Sub-resources `TrainedModel`, `TrainingJob`, and `LabeledDocument` inherit group enforcement from `LabelingProject`; see US-013
