# US-001: Add Session ID to Request Context and Log Output

**As a** platform operator,
**I want to** see the Keycloak session ID in every log line for authenticated requests,
**So that** I can browse all activity within a single user session for debugging and audit purposes.

## Acceptance Criteria

- [ ] **Scenario 1**: SessionId added to request context
    - **Given** a request authenticated via Keycloak JWT (containing `session_state` claim)
    - **When** the request passes through the logging middleware and interceptor
    - **Then** the `session_state` value from `req.user` is stored as `sessionId` in the `AsyncLocalStorage` request context alongside the existing `requestId` and `userId`

- [ ] **Scenario 2**: SessionId appears in NDJSON log output
    - **Given** a request with a resolved `sessionId` in the request context
    - **When** any log statement is emitted via `AppLoggerService` during request processing
    - **Then** the NDJSON log line includes a `sessionId` field with the Keycloak `session_state` value

- [ ] **Scenario 3**: LogContext interface updated in shared logging package
    - **Given** the `@ai-di/shared-logging` package defines a `LogContext` interface
    - **When** the `sessionId` field is added to the interface
    - **Then** the `LogContext` interface includes an optional `sessionId: string` field and the logger accepts and outputs it

- [ ] **Scenario 4**: Unauthenticated requests omit sessionId
    - **Given** a request to a public endpoint (no JWT present)
    - **When** the request is logged
    - **Then** the `sessionId` field is omitted from the log output (not set to null or empty string)

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Reuse existing Passport/IdentityGuard infrastructure — no manual JWT decoding
- `session_state` is already available on `req.user` after `KeycloakJwtStrategy` validation
- `session_state` is treated as non-sensitive (opaque Keycloak UUID)
- Files affected: `request-context.ts`, `request-logging.interceptor.ts`, `logging.middleware.ts`, `LogContext` interface in `packages/logging`
