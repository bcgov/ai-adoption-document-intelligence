# US-018: Usage REST API Authentication and Authorization

**As a** developer integrating with the billing system,
**I want to** have all usage endpoints properly authenticated and group-scoped,
**So that** groups can only access their own data and platform admin endpoints are protected from unauthorized access.

## Acceptance Criteria

- [ ] **Scenario 1**: Group-scoped endpoints return only the authenticated group's data
    - **Given** a valid JWT or API key authenticated as group A
    - **When** they access `/api/groups/:groupId/usage/*` where `:groupId` matches their group
    - **Then** the response contains only that group's usage data

- [ ] **Scenario 2**: Platform admin endpoints require the PLATFORM_ADMIN role
    - **Given** a valid JWT for a user with the `PLATFORM_ADMIN` role
    - **When** they access any `/api/admin/usage/*` or `/api/admin/rate-versions/*` endpoint
    - **Then** the response is returned successfully

- [ ] **Scenario 3**: Unauthenticated requests to any usage endpoint are rejected
    - **Given** a request to any usage endpoint with no authentication token or an invalid token
    - **When** the request is processed
    - **Then** the response is HTTP 401

- [ ] **Scenario 4**: Group users cannot access another group's data
    - **Given** a valid JWT authenticated as group A
    - **When** they request usage data for group B (`/api/groups/groupB-id/usage/*`)
    - **Then** the response is HTTP 403

- [ ] **Scenario 5**: Non-admin users cannot access platform admin endpoints
    - **Given** a valid JWT for a user without the `PLATFORM_ADMIN` role
    - **When** they access any `/api/admin/*` endpoint
    - **Then** the response is HTTP 403

## Priority
- [x] Medium (Should Have)

## Technical Notes / Assumptions
- Authentication follows the existing pattern in this codebase (JWT bearer token or `x-api-key` header)
- The existing NestJS guards (`@Roles`, `@UseGuards`) should be applied to all billing endpoints
- Full Swagger/OpenAPI documentation is required on all controllers: `@ApiOperation`, `@ApiOkResponse`, `@ApiForbiddenResponse`, `@ApiUnauthorizedResponse` with dedicated DTO classes for all request/response shapes
- Group admin endpoints require the user's group membership to match the `:groupId` path parameter
- This story ensures the authorization layer is applied consistently across all endpoints introduced by US-014, US-015, US-016, and US-017
