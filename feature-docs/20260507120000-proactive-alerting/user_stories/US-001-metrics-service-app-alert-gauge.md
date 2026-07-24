# US-001: Add Application Alert Counters to MetricsService

**As a** backend developer,
**I want to** have application-level alert counters exposed by `MetricsService` and incremented automatically by the shared logger hook,
**So that** application code can raise alert conditions simply by logging at `warn` or `error` level with an `alertType` in context, and Prometheus can evaluate those counters in alert rules.

## Acceptance Criteria

- [x] **Scenario 1**: Alert counters are registered and appear in the metrics endpoint
    - **Given** the `MetricsService` has initialized
    - **When** `GET /metrics` is called
    - **Then** the response contains `app_error_total{type, severity}`, `app_recovery_total{type}`, and `app_success_total{type}`

- [x] **Scenario 2**: A `warn` log with `alertType` increments `app_error_total` with `severity=warning`
    - **Given** a logger is created with a `metricsHook` from `MetricsService`
    - **When** `logger.warn("...", { alertType: "my_type" })` is called
    - **Then** `app_error_total{type="my_type", severity="warning"}` increments by 1

- [x] **Scenario 3**: An `error` log with `alertType` increments `app_error_total` with `severity=critical`
    - **Given** a logger is created with a `metricsHook` from `MetricsService`
    - **When** `logger.error("...", { alertType: "my_type" })` is called
    - **Then** `app_error_total{type="my_type", severity="critical"}` increments by 1

- [x] **Scenario 4**: An `info` log after an error increments `app_recovery_total` and clears error state
    - **Given** `app_error_total{type="my_type"}` has been incremented
    - **When** `logger.info("...", { alertType: "my_type" })` is called
    - **Then** `app_recovery_total{type="my_type"}` increments by 1 and subsequent `info` logs for that type no longer increment recovery

- [x] **Scenario 5**: Multiple alert types are tracked independently
    - **Given** `logger.warn` is called for both `type_a` and `type_b`
    - **When** `logger.info` is called only for `type_a`
    - **Then** `app_recovery_total{type="type_a"}` increments but `app_error_total{type="type_b"}` remains unchanged

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Three counters are registered in `MetricsService`: `app_error_total{type, severity}`, `app_recovery_total{type}`, `app_success_total{type}`.
- `MetricsService.getMetricsHook()` returns a `MetricsHook` callback that the shared logger calls on each log line containing `alertType` in context.
- No `recordAlert`/`clearAlert` public API — alert state is driven entirely through logging.
- `activeErrorTypes: Set<string>` tracks which types are currently in error state, enabling the recovery transition increment.
- Unit tests in `metrics.service.spec.ts` cover all counter increments and state transitions.
