# US-012: Update docs-md Documentation for Alerting System

**As a** developer or operator,
**I want** the `/docs-md/` folder updated with documentation covering the new alerting system,
**So that** future maintainers can understand how to configure, use, silence, and extend alerts without reverse-engineering the code.

## Acceptance Criteria

- [x] **Scenario 1**: A new alerting architecture document is created in `docs-md/`
    - **Given** a developer unfamiliar with the alerting system reads the new document
    - **When** they follow it
    - **Then** it covers: component overview (Prometheus → Alertmanager → Teams/CHES), how alert rules are defined, how to add new rules, how to silence alerts via Alertmanager UI, and the environment flags (`notificationsEnabled`, `minNotificationSeverity`, `notificationChannel`)

- [x] **Scenario 2**: In-app alerting documentation is included in `docs-md/`
    - **Given** a backend or Temporal developer wants to raise a custom alert from code
    - **When** they read the document
    - **Then** it explains how to use the shared logger with `alertType` in context, how the logger hook drives counter increments automatically, and how to choose an appropriate `alertType` string

- [x] **Scenario 3**: `PROMETHEUS_METRICS.md` is updated to reference the new in-app alert counters
    - **Given** the existing `docs-md/PROMETHEUS_METRICS.md` documents exposed metrics
    - **When** it is updated
    - **Then** the metrics table includes `app_error_total{type, severity}`, `app_recovery_total{type}`, and `app_success_total{type}` with their types (Counter) and descriptions

- [x] **Scenario 4**: `PLG_DEPLOYMENT_INTEGRATION.md` is updated to reference Alertmanager and the new secrets
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
