# US-012: Update docs-md Documentation for Alerting System

**As a** developer or operator,
**I want** the `/docs-md/` folder updated with documentation covering the new alerting system,
**So that** future maintainers can understand how to configure, use, silence, and extend alerts without reverse-engineering the code.

## Acceptance Criteria

- [ ] **Scenario 1**: A new alerting architecture document is created in `docs-md/`
    - **Given** a developer unfamiliar with the alerting system reads the new document
    - **When** they follow it
    - **Then** it covers: component overview (Prometheus → Alertmanager → Teams/CHES), how alert rules are defined, how to add new rules, how to silence alerts via Alertmanager UI, and the environment flags (`notificationsEnabled`, `minNotificationSeverity`, `notificationChannel`)

- [ ] **Scenario 2**: A new in-app alerting guide is created in `docs-md/`
    - **Given** a backend or Temporal developer wants to raise a custom alert from code
    - **When** they read the guide
    - **Then** it explains how to inject `MetricsService`, call `recordAlert` and `clearAlert`, choose a `type` string, and select an appropriate severity

- [ ] **Scenario 3**: `PROMETHEUS_METRICS.md` is updated to reference the new `app_alert_active` gauge
    - **Given** the existing `docs-md/PROMETHEUS_METRICS.md` documents exposed metrics
    - **When** it is updated
    - **Then** the metrics table includes `app_alert_active` with its label dimensions, type (Gauge), and description

- [ ] **Scenario 4**: `PLG_DEPLOYMENT_INTEGRATION.md` is updated to reference Alertmanager and the new secrets
    - **Given** the existing `docs-md/PLG_DEPLOYMENT_INTEGRATION.md` documents PLG deployment
    - **When** it is updated
    - **Then** it lists the new `ALERTMANAGER_*` environment variables in the environment configuration table and notes the Alertmanager component in the stack description

## Priority
- [ ] High (Must Have)
- [x] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- New document suggested filename: `docs-md/ALERTING.md`.
- New in-app guide suggested filename: `docs-md/IN_APP_ALERTING.md` (or combine into `ALERTING.md` under a dedicated section — implementer's choice).
- Keep documentation concise and factual — no speculative or future-state content.
- This story should be implemented last as it documents the completed system.
