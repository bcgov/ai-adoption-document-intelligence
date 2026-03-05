# US-009: `@Identity` Applies Swagger Security Metadata

**As a** backend developer,
**I want** the `@Identity` decorator to automatically apply the appropriate Swagger security metadata (`@ApiBearerAuth()` and/or `@ApiSecurity('api-key')`),
**So that** the generated API documentation accurately reflects authentication requirements and I no longer need to apply `@ApiKeyAuth()` or `@KeycloakSSOAuth()` separately.

## Acceptance Criteria
- [ ] **Scenario 1**: `@ApiBearerAuth()` is applied by default
    - **Given** `@Identity({})` (no `allowApiKey`) is applied to a handler
    - **When** the Swagger document is generated
    - **Then** the endpoint is listed under the Bearer auth security scheme

- [ ] **Scenario 2**: Both `@ApiBearerAuth()` and `@ApiSecurity('api-key')` are applied when `allowApiKey: true`
    - **Given** `@Identity({ allowApiKey: true })` is applied
    - **When** the Swagger document is generated
    - **Then** the endpoint is listed under both the Bearer auth and API key security schemes

- [ ] **Scenario 3**: Only `@ApiBearerAuth()` is applied when `allowApiKey: false`
    - **Given** `@Identity({ allowApiKey: false })` is applied
    - **When** the Swagger document is generated
    - **Then** only the Bearer auth security scheme is present for the endpoint (not the API key scheme)

- [ ] **Scenario 4**: Swagger metadata is applied via decorator composition (not runtime logic)
    - **Given** the `@Identity` implementation
    - **When** the decorator is defined
    - **Then** the Swagger metadata is composed using NestJS `applyDecorators` with `ApiBearerAuth` / `ApiSecurity`

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- Use NestJS `applyDecorators` to compose `SetMetadata`, `ApiBearerAuth()`, and conditionally `ApiSecurity('api-key')`.
- The string `'api-key'` must match the existing security scheme name registered in the Swagger setup.
- This replaces the role of `@ApiKeyAuth()` and `@KeycloakSSOAuth()` for Swagger documentation.
