# US-015: Migrate Resource-by-ID Endpoints to Use `resolvedIdentity.groupRoles`

**As a** backend developer,
**I want** resource-by-ID endpoints (e.g. `GET /documents/:documentId`) to check `resolvedIdentity.groupRoles[resource.group_id]` directly instead of calling `identityCanAccessGroup`,
**So that** group membership is verified consistently using the enriched identity without a dedicated helper function.

## Acceptance Criteria
- [x] **Scenario 1**: Controller reads `resolvedIdentity.groupRoles` after fetching the resource
    - **Given** an endpoint that fetches a resource (e.g. a document) to obtain its `group_id`
    - **When** the resource is fetched
    - **Then** the controller checks `resolvedIdentity.groupRoles[resource.group_id]` to determine access, instead of calling `identityCanAccessGroup`

- [x] **Scenario 2**: Non-member receives 403 when accessing a resource belonging to another group
    - **Given** the migrated endpoint
    - **When** a user who is not a member of the resource's group makes the request
    - **Then** the controller throws `ForbiddenException` (403)

- [x] **Scenario 3**: `@Identity` decorator is present for Swagger and guard enrichment
    - **Given** the migrated endpoint
    - **When** the endpoint is inspected
    - **Then** it has `@Identity({ allowApiKey: true })` (or similar) to ensure Swagger metadata and identity enrichment are applied

- [x] **Scenario 4**: System admin can access any resource regardless of group membership
    - **Given** `resolvedIdentity.isSystemAdmin = true`
    - **When** the controller performs the group check
    - **Then** the check passes for any resource group

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- These endpoints cannot use `groupIdFrom` in `@Identity` because the group ID is not known until the resource is fetched inside the controller (sub-resource traversal). The guard enriches the identity, but the membership check remains in the controller.
- The pattern is: guard enriches `resolvedIdentity` → controller fetches resource → controller checks `resolvedIdentity.groupRoles[resource.group_id]`.
- System admin bypass in the controller: `if (resolvedIdentity.isSystemAdmin) { /* skip check */ }`.
