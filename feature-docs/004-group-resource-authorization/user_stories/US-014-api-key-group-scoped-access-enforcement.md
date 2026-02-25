# US-014: API Key Group-Scoped Access Enforcement

**As a** system user authenticating via API key,
**I want to** have my API key's access restricted to resources belonging to the group the key is scoped to,
**So that** API key authentication enforces the same group-based authorization as JWT authentication.

## Acceptance Criteria
- [ ] **Scenario 1**: API key accesses a resource in its group
    - **Given** an API key scoped to group X
    - **And** a resource with `group_id` = X exists
    - **When** a request is made using this API key to read or modify that resource
    - **Then** the request is permitted and succeeds

- [ ] **Scenario 2**: API key attempts to access a resource in a different group
    - **Given** an API key scoped to group X
    - **And** a resource with `group_id` = Y (Y ≠ X) exists
    - **When** a request is made using this API key to access that resource
    - **Then** the API returns `403 Forbidden`

- [ ] **Scenario 3**: API key group_id is used directly without a DB user lookup
    - **Given** a request authenticated via API key
    - **When** the authorization helper resolves group membership
    - **Then** the API key's `group_id` is used directly (no user group lookup is performed)

- [ ] **Scenario 4**: Unit tests cover API key enforcement paths
    - **Given** the API key enforcement implementation
    - **When** unit tests are run
    - **Then** authorized and unauthorized access cases for API key auth are covered and pass

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Depends on US-005 (schema: group_id on ApiKey), US-006 (identity guard), US-007 (authorization helper)
- The `group_id` on the `ApiKey` record is the sole source of group membership for API key auth — no join to `user_group` is needed
- This behaviour must be handled as a distinct path in the authorization helper (US-007)
