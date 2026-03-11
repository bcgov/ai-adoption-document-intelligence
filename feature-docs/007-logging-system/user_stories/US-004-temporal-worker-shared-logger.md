# US-004: Temporal Worker Use Shared Logger with Workflow/Activity Context

**As a** developer,
**I want** the Temporal worker to use the shared logging module and attach workflowExecutionId and activity name to log context where available,
**So that** workflow and activity logs are structured and traceable without ad-hoc console.log(JSON.stringify(...)).

## Acceptance Criteria
- [ ] **Scenario 1**: Shared logger is used in the worker process
    - **Given** the Temporal worker
    - **When** any log is emitted from worker code
    - **Then** output goes through the shared logging module with service name temporal-worker and is NDJSON to stdout

- [ ] **Scenario 2**: Activity logs include activity name and workflow execution id
    - **Given** an activity running in a workflow
    - **When** the activity emits a log
    - **Then** log context includes activity name (e.g. activity type or name) and workflowExecutionId when available from Temporal context

- [ ] **Scenario 3**: Ad-hoc console.log(JSON.stringify(...)) replaced
    - **Given** activities such as poll-ocr-results, submit-to-azure-ocr, upsert-ocr-result
    - **When** the migration is complete
    - **Then** these use the shared logger (e.g. log.info(message, { activity, event, ... })) and no longer use console.log(JSON.stringify(...))

- [ ] **Scenario 4**: Workflow-level logs include workflow execution id
    - **Given** the graph runner or workflow code
    - **When** a log is emitted from workflow code
    - **Then** workflowExecutionId (and any other correlation IDs passed in input) can be attached to log context

- [ ] **Scenario 5**: LOG_LEVEL respected in worker
    - **Given** LOG_LEVEL set in the worker environment
    - **When** the shared module is used in the worker
    - **Then** the same LOG_LEVEL behavior as in US-002 applies (default info, filter by level)

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Worker runs in Node; shared module must be importable from apps/temporal (e.g. via apps/shared or workspace package).
- Activity context: use Temporal's Context to obtain workflow info (e.g. workflowExecution()) and pass to logger. If not easily available in some code paths, document where context is best attached.
- No backward compatibility with old log format; replace all existing activity log calls with shared logger.
