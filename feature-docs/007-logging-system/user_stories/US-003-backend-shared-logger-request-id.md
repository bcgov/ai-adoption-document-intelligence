# US-003: Backend Use Shared Logger with Request-Scoped requestId

**As a** developer,
**I want** the NestJS backend to use the shared logging module and attach a requestId (and userId when available) to every log within a request,
**So that** API logs are structured and traceable per request without changing each service manually.

## Acceptance Criteria
- [ ] **Scenario 1**: Shared logger is used instead of Nest Logger
    - **Given** backend-services
    - **When** any existing Logger from @nestjs/common is replaced or wrapped
    - **Then** log output goes through the shared logging module and is NDJSON to stdout with service name backend-services

- [ ] **Scenario 2**: requestId is generated and attached per request
    - **Given** an incoming HTTP request
    - **When** the request is processed
    - **Then** a requestId (e.g. UUID or cuid) is generated (or read from header if provided), and every log emitted during that request includes requestId in context

- [ ] **Scenario 3**: userId in log context when authenticated
    - **Given** a request with an authenticated user (e.g. JWT or API key)
    - **When** logs are emitted during that request
    - **Then** userId (or equivalent) is included in log context when available; when not authenticated it is omitted

- [ ] **Scenario 4**: Request lifecycle logs
    - **Given** an incoming request
    - **When** the request completes (success or error)
    - **Then** at least one log line includes method, path, statusCode, durationMs, requestId so that request/API category is satisfied

- [ ] **Scenario 5**: Existing log call sites updated
    - **Given** current use of Logger in document.service, storage.service, azure.controller, training.service, and other backend files
    - **When** the migration is complete
    - **Then** these use the shared logger (or a NestJS adapter that delegates to it) and no longer use Nest's Logger for application logs

- [ ] **Scenario 6**: Third-party loggers routed through shared logger
    - **Given** third-party libraries that emit logs (e.g. Prisma with log: ["error", "warn"])
    - **When** the backend runs
    - **Then** their output is wired to the shared logger so all process output is NDJSON (no direct stdout/stderr in a different format)

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Use middleware or an interceptor to generate/attach requestId and create a request-scoped logger (or bind context). Ensure async context is preserved (e.g. AsyncLocalStorage or Nest request context).
- Prisma and other third-party loggers must be wired to the shared logger so all process output is NDJSON (REQUIREMENTS acceptance criterion 8); avoid duplicate or overly noisy DB logs.
- Bootstrap logger in main.ts should also use shared logger so startup logs are structured.
