# US-001: Add app_alert_active Gauge to MetricsService

**As a** backend developer,
**I want to** have `recordAlert` and `clearAlert` methods on `MetricsService` backed by an `app_alert_active` Prometheus Gauge,
**So that** application code can flag and clear alert conditions that Prometheus scrapes and evaluates.

## Acceptance Criteria

- [ ] **Scenario 1**: Gauge is registered and appears in the metrics endpoint
    - **Given** the `MetricsService` has initialized
    - **When** `GET /metrics` is called
    - **Then** the response contains `app_alert_active` with `type` and `severity` label dimensions

- [ ] **Scenario 2**: `recordAlert` sets the gauge to 1 for the given type and severity
    - **Given** no prior alert has been recorded for `type="workflow_activity_failed"` and `severity="critical"`
    - **When** `recordAlert("workflow_activity_failed", "critical")` is called
    - **Then** `app_alert_active{type="workflow_activity_failed", severity="critical"}` equals `1`

- [ ] **Scenario 3**: `clearAlert` sets the gauge to 0 for the given type
    - **Given** `app_alert_active{type="workflow_activity_failed", severity="critical"}` is `1`
    - **When** `clearAlert("workflow_activity_failed")` is called
    - **Then** `app_alert_active{type="workflow_activity_failed", severity="critical"}` equals `0`

- [ ] **Scenario 4**: Multiple alert types are tracked independently
    - **Given** `recordAlert("workflow_activity_failed", "critical")` has been called
    - **When** `recordAlert("ai_service_unavailable", "warning")` is also called
    - **Then** both `app_alert_active{type="workflow_activity_failed"}` and `app_alert_active{type="ai_service_unavailable"}` equal `1` independently

- [ ] **Scenario 5**: Clearing one alert type does not affect others
    - **Given** both `workflow_activity_failed` and `ai_service_unavailable` alerts are active
    - **When** `clearAlert("workflow_activity_failed")` is called
    - **Then** `app_alert_active{type="workflow_activity_failed"}` equals `0` and `app_alert_active{type="ai_service_unavailable"}` remains `1`

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Add a `Gauge` named `app_alert_active` with `labelNames: ["type", "severity"]` to `MetricsService`, registered on the existing private registry.
- `recordAlert(type: string, severity: "info" | "warning" | "critical")` sets `.labels({ type, severity }).set(1)`.
- `clearAlert(type: string)` requires iterating label combinations or storing a reference map — use a `Map<string, { severity: string }>` to track active alert labels so the correct label set can be cleared.
- No `any` types; use a string union for `severity`.
- Unit tests must be added/updated in `metrics.service.spec.ts`.
