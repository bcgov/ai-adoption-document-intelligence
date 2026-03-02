# US-016: Block Access to Orphaned Records with No group_id

**As a** system operator,
**I want to** ensure that records with no `group_id` are inaccessible to all non-system-admin users,
**So that** legacy/orphaned data does not bypass the authorization model.

## Acceptance Criteria
- [x] **Scenario 1**: User attempts to access an orphaned top-level resource
    - **Given** a top-level resource (`Document`, `Workflow`, `LabelingProject`, or `LabelingDocument`) exists with `group_id = null`
    - **When** any non-system-admin user attempts to read, update, or delete it
    - **Then** the API returns `404 Not Found`

- [x] **Scenario 2**: User attempts to access an orphaned sub-resource (via parent traversal)
    - **Given** a parent resource exists with `group_id = null`
    - **And** a sub-resource is associated with that parent
    - **When** any non-system-admin user attempts to access the sub-resource
    - **Then** the API returns `404 Not Found`

- [x] **Scenario 3**: No migration or remediation endpoint is provided
    - **Given** orphaned records exist in the database
    - **When** the feature is deployed
    - **Then** no bulk-update or assignment endpoint is available to assign `group_id` to orphaned records

- [x] **Scenario 4**: Unit tests cover orphaned record handling
    - **Given** the authorization helper and service implementations
    - **When** unit tests are run
    - **Then** the `404 Not Found` response for `group_id = null` resources is explicitly covered and passes

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- The `404 Not Found` (rather than `403 Forbidden`) is intentional — it avoids leaking the existence of orphaned records
- This behaviour is implemented in the shared authorization helper (US-007) as the `group_id = null` branch
- `system-admin` bypass for orphaned records is a placeholder pending the roles & claims system (§9)
- No data migration will be built; orphaned records remain in the database but are inaccessible
