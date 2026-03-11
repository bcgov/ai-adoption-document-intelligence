# US-002: Implement Shared Logging Module

**As a** developer,
**I want to** use a shared logging module that outputs NDJSON to stdout with configurable level and redaction,
**So that** both backend-services and temporal-worker produce consistent, safe logs without duplicating logic.

## Acceptance Criteria
- [ ] **Scenario 1**: Module outputs NDJSON to stdout
    - **Given** a call to log.info, log.warn, log.error, or log.debug
    - **When** the logger runs
    - **Then** exactly one line of JSON is written to stdout with required fields timestamp (ISO 8601), level, service, message, and any provided context fields

- [ ] **Scenario 2**: Log level is configurable via LOG_LEVEL
    - **Given** environment variable LOG_LEVEL set to debug, info, warn, or error
    - **When** the module is used
    - **Then** only messages at that level or higher are emitted (e.g. info shows info, warn, error; debug shows all)

- [ ] **Scenario 3**: Default log level when LOG_LEVEL is unset
    - **Given** LOG_LEVEL is not set or is invalid
    - **When** the module is used
    - **Then** default level is info and invalid values fall back to info

- [ ] **Scenario 4**: Simple API for both apps
    - **Given** the shared module
    - **When** a caller uses it
    - **Then** API exposes at least log.info(message, context?), log.warn(message, context?), log.error(message, context?), log.debug(message, context?) and a way to set service name (e.g. constructor or createLogger(serviceName))

- [ ] **Scenario 5**: Redaction of secrets
    - **Given** context that might contain keys or tokens
    - **When** the logger serializes the log entry
    - **Then** known secret keys (e.g. apiKey, token, authorization) are redacted (e.g. "[REDACTED]") and never written to stdout

- [ ] **Scenario 6**: Child/request-scoped context support
    - **Given** a need to add requestId or workflowExecutionId to every log in a scope
    - **When** the caller creates a child logger or binds context
    - **Then** the module supports adding persistent context (e.g. createLogger(serviceName, baseContext) or logger.child(context)) so that every log in that scope includes the bound context

- [ ] **Scenario 7**: Failure behavior — do not throw
    - **Given** logging fails (e.g. serialization throws or stdout write fails)
    - **When** the logger handles the failure
    - **Then** the logger does not throw; it uses best-effort fallback to stderr (e.g. plain text or best-effort JSON) so the application continues; the log line may be lost or degraded

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Module lives under apps/shared (e.g. apps/shared/logging) or a package usable by both backend and worker.
- Uses the types from US-001 for log entry shape.
- No file or custom transport; stdout only. No dependency on NestJS or Temporal in the shared module.
- Stack traces for log.error can be passed in context; module must not log raw process.env secrets.
- LOG_LEVEL default is `info`; if unset or invalid, use `info`. Callers (e.g. backend in US-003) will wire third-party loggers (e.g. Prisma) to this module so all process output is NDJSON.
