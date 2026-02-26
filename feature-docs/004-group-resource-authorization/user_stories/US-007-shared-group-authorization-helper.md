# US-007: Create Shared Service-Level Group Authorization Helper

**As a** backend developer,
**I want to** implement a shared authorization helper that checks whether a requestor is a member of a given group,
**So that** all services can enforce group-based access control consistently without duplicating logic.

## Acceptance Criteria
- [x] **Scenario 1**: JWT user passes group membership check
    - **Given** a requestor authenticated via JWT who is a member of group X
    - **When** the authorization helper is called with the requestor's identity and group X's ID
    - **Then** the helper permits access (does not throw)

- [x] **Scenario 2**: JWT user fails group membership check
    - **Given** a requestor authenticated via JWT who is NOT a member of group X
    - **When** the authorization helper is called with the requestor's identity and group X's ID
    - **Then** the helper throws a `403 Forbidden` exception

- [x] **Scenario 3**: API key passes group membership check
    - **Given** a requestor authenticated via API key scoped to group X
    - **When** the authorization helper is called with the API key's group_id and the resource's group_id
    - **Then** the helper permits access when both group IDs match

- [x] **Scenario 4**: API key fails group membership check
    - **Given** a requestor authenticated via API key scoped to group Y
    - **When** the authorization helper is called and the resource belongs to group X (X ≠ Y)
    - **Then** the helper throws a `403 Forbidden` exception

This scenario intentionally altered. A group_id should always be provided.
- [ ] **Scenario 5**: Resource has no group_id
    - **Given** a resource with `group_id = null`
    - **When** the authorization helper is called for that resource
    - **Then** the helper throws a `404 Not Found` exception

- [x] **Scenario 6**: Requestor is a member of multiple groups
    - **Given** a requestor who belongs to groups X and Y
    - **When** the authorization helper is called for a resource in group Y
    - **Then** the helper permits access

- [x] **Scenario 7**: Unit tests cover all paths
    - **Given** the helper implementation
    - **When** unit tests are run
    - **Then** all scenarios (pass, 403, 404, multi-group) are covered and pass

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- The helper should accept: resolved requestor identity (from request context, see US-006), and the target resource's `group_id`
- For JWT users: query the `user_group` table to check membership; use indexed lookups per §7
- For API key users: compare the API key's `group_id` directly against the resource's `group_id` — no DB lookup required
- The `system-admin` bypass is a placeholder pending the roles & claims system (see §9); include a stub/comment but do not implement role-based short-circuit yet
- This helper is called at the service layer, after the resource has been fetched, to avoid double-DB-round-trips
