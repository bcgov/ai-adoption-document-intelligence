# US-013: Enforce Group Authorization on Sub-Resources via Parent Traversal

**As a** system user,
**I want to** be prevented from reading or modifying sub-resources whose parent belongs to a group I am not a member of,
**So that** sub-resource access is consistently protected by the same group authorization as their parents.

## Acceptance Criteria
- [ ] **Scenario 1**: Member accesses a TrainedModel under a LabelingProject in their group
    - **Given** a requestor who is a member of group X
    - **And** a `LabelingProject` with `group_id` = X exists with a child `TrainedModel`
    - **When** the requestor fetches the `TrainedModel`
    - **Then** the resource is returned successfully

- [ ] **Scenario 2**: Non-member attempts to access a TrainedModel
    - **Given** a requestor who is NOT a member of group X
    - **And** a `LabelingProject` with `group_id` = X exists with a child `TrainedModel`
    - **When** the requestor attempts to fetch the `TrainedModel`
    - **Then** the API returns `403 Forbidden`

- [ ] **Scenario 3**: Non-member attempts to access a TrainingJob
    - **Given** a requestor who is NOT a member of group X
    - **And** a `LabelingProject` with `group_id` = X exists with a child `TrainingJob`
    - **When** the requestor attempts to fetch the `TrainingJob`
    - **Then** the API returns `403 Forbidden`

- [ ] **Scenario 4**: Non-member attempts to access a LabeledDocument
    - **Given** a requestor who is NOT a member of group X
    - **And** a `LabelingProject` with `group_id` = X exists with a child `LabeledDocument`
    - **When** the requestor attempts to fetch the `LabeledDocument`
    - **Then** the API returns `403 Forbidden`

- [ ] **Scenario 5**: Non-member attempts to access a ReviewSession
    - **Given** a requestor who is NOT a member of group X
    - **And** a `Document` with `group_id` = X exists with a child `ReviewSession`
    - **When** the requestor attempts to fetch the `ReviewSession`
    - **Then** the API returns `403 Forbidden`

- [ ] **Scenario 6**: Unit tests cover parent traversal for all four sub-resource types
    - **Given** the enforcement implementation
    - **When** unit tests are run
    - **Then** authorized and unauthorized access for `TrainedModel`, `TrainingJob`, `LabeledDocument`, and `ReviewSession` are all covered and pass

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Sub-resources have no `group_id` column; the parent's `group_id` is resolved by traversal at the service layer
- Sub-resource → parent mappings:
  - `TrainedModel` → `LabelingProject`
  - `TrainingJob` → `LabelingProject`
  - `LabeledDocument` → `LabelingProject`
  - `ReviewSession` → `Document`
- Traversal can be done via a single JOIN or a two-step fetch; prefer the approach that minimizes additional DB queries
- Reuses the shared authorization helper from US-007; no new membership check logic required
- All CRUD operations on sub-resources must be covered
