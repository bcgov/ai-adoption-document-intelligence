# US-002: Add Client IP to Log Output

**As a** platform operator,
**I want to** see the client's IP address in every request log line,
**So that** I can identify the source of requests for security auditing and incident investigation.

## Acceptance Criteria

- [x] **Scenario 1**: Client IP extracted from X-Forwarded-For header
    - **Given** a request with an `X-Forwarded-For` header containing one or more comma-separated IPs (e.g., `"203.0.113.50, 70.41.3.18, 150.172.238.178"`)
    - **When** the request is processed by the logging middleware
    - **Then** the first IP in the list is extracted, trimmed, and stored as `clientIp` in the log context

- [x] **Scenario 2**: Fallback to X-Real-IP header
    - **Given** a request without an `X-Forwarded-For` header but with an `X-Real-IP` header
    - **When** the request is processed by the logging middleware
    - **Then** the `X-Real-IP` header value is used as `clientIp`

- [x] **Scenario 3**: Fallback to socket remote address
    - **Given** a request without `X-Forwarded-For` or `X-Real-IP` headers (e.g., local development)
    - **When** the request is processed by the logging middleware
    - **Then** `req.socket.remoteAddress` is used as `clientIp`

- [x] **Scenario 4**: ClientIp appears in NDJSON log output
    - **Given** a request with a resolved `clientIp`
    - **When** any log statement is emitted via `AppLoggerService` during request processing
    - **Then** the NDJSON log line includes a `clientIp` field

- [x] **Scenario 5**: LogContext interface updated for clientIp
    - **Given** the `@ai-di/shared-logging` package defines a `LogContext` interface
    - **When** the `clientIp` field is added to the interface
    - **Then** the `LogContext` interface includes an optional `clientIp: string` field and the logger accepts and outputs it

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Extraction priority: `X-Forwarded-For` (first entry) > `X-Real-IP` > `req.socket.remoteAddress`
- On OpenShift, the client IP arrives via `X-Forwarded-For` due to reverse proxy/ingress
- Files affected: `logging.middleware.ts` or `request-logging.interceptor.ts`, `LogContext` interface in `packages/logging`
