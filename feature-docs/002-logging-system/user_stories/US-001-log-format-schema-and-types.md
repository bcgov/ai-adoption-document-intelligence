# US-001: Define Log Format Schema and Types

**As a** developer,
**I want to** have a defined log format schema and shared TypeScript types for structured logs,
**So that** backend and Temporal worker can produce consistent NDJSON output and log consumers can rely on a stable schema.

## Acceptance Criteria
- [ ] **Scenario 1**: Required fields are defined
    - **Given** the requirements in Section 5 (Log Format and Structure)
    - **When** the schema is implemented
    - **Then** required fields are defined: `timestamp` (ISO 8601), `level`, `service`, `message`

- [ ] **Scenario 2**: Context field names and types are defined
    - **Given** the context fields listed in the requirements (requestId, workflowExecutionId, documentId, userId, activity, event, durationMs, status, error, stack)
    - **When** the types are reviewed
    - **Then** a shared type or interface defines optional context fields with consistent camelCase naming and appropriate TypeScript types

- [ ] **Scenario 3**: Log level union type exists
    - **Given** supported levels debug, info, warn, error
    - **When** the types are reviewed
    - **Then** a `LogLevel` type (or equivalent) restricts level to these values

- [ ] **Scenario 4**: Single log line type is exported
    - **Given** required and optional context fields
    - **When** a caller builds a log entry
    - **Then** a `StructuredLogEntry` (or equivalent) type is available in the shared package so both apps can type their log payloads

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Types live in a shared location (e.g. `apps/shared/logging` or a dedicated package) so both backend-services and temporal-worker can import them.
- Format is NDJSON: one JSON object per line, UTF-8. Schema documentation will be completed in US-006.
- No `any`; use proper typing for context object (e.g. `Record<string, unknown>` for extensibility with known keys optional).
