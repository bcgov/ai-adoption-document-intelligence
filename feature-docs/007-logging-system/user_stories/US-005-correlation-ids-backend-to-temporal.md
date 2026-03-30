# US-005: Propagate requestId from Backend to Temporal Workflow

**As a** developer,
**I want** the backend to pass requestId (and other correlation IDs) in Temporal workflow input when starting a workflow,
**So that** a single request can be traced from API through to worker logs in the log aggregation backend.

## Acceptance Criteria
- [ ] **Scenario 1**: requestId is passed in workflow input
    - **Given** the backend starts a Temporal workflow (e.g. graph workflow or OCR workflow)
    - **When** the workflow is started
    - **Then** the workflow input includes requestId (from the current HTTP request context) so the worker can read it

- [ ] **Scenario 2**: Worker includes requestId in log context
    - **Given** workflow input that contains requestId
    - **When** the worker (activities or workflow code) logs
    - **Then** requestId is included in log context so that logs from the same API request share the same requestId

- [ ] **Scenario 3**: workflowExecutionId available in worker logs
    - **Given** a running workflow
    - **When** the worker logs
    - **Then** workflowExecutionId is included in log context where available so that all logs for one workflow execution can be filtered

- [ ] **Scenario 4**: No breaking change to workflow input contract
    - **Given** existing workflow input types (e.g. GraphWorkflowInput or equivalent)
    - **When** requestId is added
    - **Then** it is added as an optional or extended field so that existing callers remain valid; worker should handle missing requestId (e.g. omit from context)

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Backend obtains requestId from the same request-scoped context used in US-003. When starting a workflow, include it in the payload passed to Temporal.
- Worker reads requestId from workflow input and provides it to the shared logger (e.g. via child logger or base context) for the duration of that workflow/activity.
- Documentation of how to trace by requestId or workflowExecutionId is in US-006.
