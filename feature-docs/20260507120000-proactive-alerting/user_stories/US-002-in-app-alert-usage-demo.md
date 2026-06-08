# US-002: Demonstrate In-App Alerting from Backend Service and Temporal Activity

**As an** operator,
**I want** at least one NestJS backend service and one Temporal activity to log with `alertType` in context,
**So that** the in-app alerting mechanism is proven end-to-end with real application code paths.

## Acceptance Criteria

- [x] **Scenario 1**: Backend service logs a `warn` or `error` with `alertType` on a relevant failure
    - **Given** a backend service encounters a known failure condition
    - **When** that failure is caught
    - **Then** the logger call includes `{ alertType: "<type>" }` in context at `warn` or `error` level, causing `app_error_total` to increment

- [x] **Scenario 2**: Backend service logs `info` with `alertType` on recovery
    - **Given** the same backend service has a code path where the condition is no longer present
    - **When** that recovery path executes
    - **Then** the logger call includes `{ alertType: "<type>" }` in context at `info` level, triggering `app_recovery_total`

- [x] **Scenario 3**: Temporal activity logs with `alertType` on an activity failure
    - **Given** a Temporal activity encounters an unrecoverable error
    - **When** the error is handled
    - **Then** the logger call includes `{ alertType: "<type>" }` at `error` level, causing `app_error_total{severity="critical"}` to increment

- [x] **Scenario 4**: Temporal activity logs `info` with `alertType` on successful completion
    - **Given** a Temporal activity that previously could raise an alert
    - **When** the activity completes successfully
    - **Then** the logger call includes `{ alertType: "<type>" }` at `info` level, incrementing `app_success_total`

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Alert conditions are raised via the shared logger (`createLogger`) with a `metricsHook` from `MetricsService.getMetricsHook()`.
- No `recordAlert`/`clearAlert` API — all alerting flows through structured log context.
- For the Temporal activity, `MetricsService` is instantiated directly (no NestJS DI); the worker entrypoint creates and shares the metrics instance.
- The `alertType` string for each call site must match an entry in `alert-thresholds.ts` or will be caught by the catch-all `AnyBackendServicesError`/`AnyTemporalWorkerError` rules.
