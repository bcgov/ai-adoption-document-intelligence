# US-006: Logging System Documentation

**As a** developer or operator,
**I want** a single documentation file that describes what is logged, the log format, where logs go, how to use correlation IDs, and how to configure logging,
**So that** I can operate, debug, and integrate with the logging system without reading code.

## Acceptance Criteria
- [ ] **Scenario 1**: Document exists under /docs
    - **Given** the logging system
    - **When** documentation is complete
    - **Then** a document exists at docs/LOGGING.md (or docs/observability/LOGGING.md) that is the single reference for logging

- [ ] **Scenario 2**: What is logged is described
    - **Given** the document
    - **When** a reader looks for log categories
    - **Then** it describes application, request/API, business/domain, errors, external, and security/auth categories with typical levels and example context fields (per REQUIREMENTS Section 3)

- [ ] **Scenario 3**: Log format schema is documented
    - **Given** the document
    - **When** a reader looks for format details
    - **Then** it describes NDJSON, required fields (timestamp, level, service, message), optional context fields (naming and meaning), and that the schema is stable for tooling

- [ ] **Scenario 4**: Where logs are stored is documented
    - **Given** the document
    - **When** a reader looks for storage
    - **Then** it states that logs go to stdout only and are collected by the platform (OpenShift); no audit store

- [ ] **Scenario 5**: Correlation IDs and tracing are documented
    - **Given** the document
    - **When** a reader wants to trace a request or workflow
    - **Then** it explains how to use requestId and workflowExecutionId to find all log lines for a single request or workflow in the log backend

- [ ] **Scenario 6**: Redaction and sensitivity rules are documented
    - **Given** the document
    - **When** a reader looks for security rules
    - **Then** it states that secrets (API keys, tokens) and PII must not be logged; key prefixes or IDs only; redaction rules applied by the shared logger

- [ ] **Scenario 7**: Configuration is documented
    - **Given** the document
    - **When** a reader wants to configure logging
    - **Then** it describes LOG_LEVEL (debug, info, warn, error), default info, and how to set it for backend and worker (e.g. environment variable)

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Keep the doc concise; link to REQUIREMENTS.md or feature-docs/002-logging-system for full requirements. No document-specific or workload-specific examples required; keep examples generic (e.g. documentId, workflowExecutionId).
