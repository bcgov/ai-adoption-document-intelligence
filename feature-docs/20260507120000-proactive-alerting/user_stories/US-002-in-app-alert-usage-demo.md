# US-002: Demonstrate In-App Alerting from Backend Service and Temporal Activity

**As an** operator,
**I want** at least one NestJS backend service and one Temporal activity to call `recordAlert`/`clearAlert`,
**So that** the in-app alerting mechanism is proven end-to-end with real application code paths.

## Acceptance Criteria

- [x] **Scenario 1**: Backend service calls `recordAlert` on a relevant error condition
    - **Given** a backend service encounters a known failure condition (e.g., a critical dependency is unreachable or an operation fails in a way worth alerting on)
    - **When** that failure is caught
    - **Then** `metricsService.recordAlert(type, severity)` is called with an appropriate `type` string and severity

- [x] **Scenario 2**: Backend service calls `clearAlert` when the condition resolves
    - **Given** the same backend service that raised an alert previously has a code path where the condition is no longer present
    - **When** that recovery path is executed
    - **Then** `metricsService.clearAlert(type)` is called with the same `type` used to record the alert

- [x] **Scenario 3**: Temporal activity calls `recordAlert` on an activity failure
    - **Given** a Temporal activity encounters an unrecoverable error (e.g., an external service call fails beyond retries)
    - **When** the error is handled in the activity
    - **Then** `metricsService.recordAlert(type, "critical")` is called before propagating or returning the error

- [x] **Scenario 4**: Temporal activity calls `clearAlert` on successful completion
    - **Given** a Temporal activity that previously could raise an alert
    - **When** the activity completes successfully
    - **Then** `metricsService.clearAlert(type)` is called to ensure the gauge is cleared

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- The specific backend service and Temporal activity to instrument are chosen at implementation time — pick meaningful, high-visibility code paths (e.g., an Azure AI call in the worker, or a database operation in backend services).
- `MetricsService` must be injected into the chosen backend service via NestJS DI.
- For the Temporal activity, `MetricsService` is instantiated directly (Temporal workers do not use NestJS DI) — the worker entrypoint should create or import the shared metrics instance.
- The goal is a working demonstration, not exhaustive instrumentation of all services.
- Unit tests for the modified service/activity should verify that `recordAlert`/`clearAlert` are called under the expected conditions.
