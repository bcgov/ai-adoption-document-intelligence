# US-008: Enforce Group Membership on Top-Level Resource Creation

**As a** system user,
**I want to** be prevented from creating a top-level resource in a group I do not belong to,
**So that** resources are always created within groups that the requestor is authorized to access.

## Acceptance Criteria
- [ ] **Scenario 1**: Requestor creates a resource in their own group
    - **Given** a requestor who is a member of group X
    - **When** they submit a create request for a top-level resource (`Document`, `Workflow`, `LabelingProject`, or `LabelingDocument`) with `group_id` set to group X
    - **Then** the resource is created successfully and the `group_id` is persisted on the record

- [ ] **Scenario 2**: Requestor attempts to create a resource in a group they don't belong to
    - **Given** a requestor who is NOT a member of group Y
    - **When** they submit a create request with `group_id` set to group Y
    - **Then** the API returns `403 Forbidden` and no resource is created

- [ ] **Scenario 3**: Create request missing group_id is rejected
    - **Given** a requestor submits a create request without providing a `group_id`
    - **When** the request is processed
    - **Then** the API returns a `400 Bad Request` error indicating `group_id` is required

- [ ] **Scenario 4**: Applies to all four top-level resource types
    - **Given** the enforcement is implemented
    - **When** create endpoints for `Document`, `Workflow`, `LabelingProject`, and `LabelingDocument` are tested
    - **Then** all four enforce the group membership check consistently

- [ ] **Scenario 5**: Unit tests cover creation enforcement
    - **Given** the enforcement implementation
    - **When** unit tests are run
    - **Then** authorized creation, unauthorized creation, and missing group_id cases are all covered and pass

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Depends on US-001 through US-005 (schema) and US-007 (shared authorization helper)
- The `group_id` must be supplied in the request body for creation endpoints
- Membership validation calls the shared authorization helper from US-007
- `system-admin` bypass is a placeholder pending the roles & claims system (§9)
- Applies to: `Document`, `Workflow`, `LabelingProject`, `LabelingDocument`
