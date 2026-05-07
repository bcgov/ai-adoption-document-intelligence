# US-011: Wire Alertmanager Secrets into deploy-instance.yml Workflow

**As a** developer,
**I want** the new Alertmanager configuration values passed as `--set` flags in the `deploy-instance.yml` GitHub Actions workflow,
**So that** each environment receives its own notification config automatically on every deployment without manual Helm commands.

## Acceptance Criteria

- [ ] **Scenario 1**: Core Alertmanager flags are passed to the `helm upgrade` command
    - **Given** `ALERTMANAGER_NOTIFICATION_CHANNEL`, `ALERTMANAGER_NOTIFICATIONS_ENABLED`, and `ALERTMANAGER_MIN_SEVERITY` are set as GitHub Environment secrets
    - **When** the `Deploy PLG monitoring stack` step runs
    - **Then** the `helm upgrade` command includes `--set alertmanager.notificationChannel=...`, `--set alertmanager.notificationsEnabled=...`, and `--set alertmanager.minNotificationSeverity=...`

- [ ] **Scenario 2**: CHES secrets are passed via `--set` flags
    - **Given** `ALERTMANAGER_RECIPIENTS`, `ALERTMANAGER_CHES_CLIENT_ID`, and `ALERTMANAGER_CHES_CLIENT_SECRET` are set as GitHub Environment secrets
    - **When** the `Deploy PLG monitoring stack` step runs
    - **Then** the `helm upgrade` command includes the corresponding `--set alertmanager.ches.*` flags

- [ ] **Scenario 3**: Teams webhook URL placeholder is passed for stub completeness
    - **Given** `ALERTMANAGER_TEAMS_WEBHOOK_URL` is set as a GitHub Environment secret (may be a placeholder string)
    - **When** the `Deploy PLG monitoring stack` step runs
    - **Then** the `helm upgrade` command includes `--set alertmanager.teams.webhookUrl=...`

- [ ] **Scenario 4**: New secrets are declared in the `Deploy PLG monitoring stack` step's `env:` block
    - **Given** the `deploy-instance.yml` workflow file is reviewed
    - **When** the `Deploy PLG monitoring stack` step's `env:` block is checked
    - **Then** all new `ALERTMANAGER_*` secret references are present alongside the existing `GRAFANA_ADMIN_PASSWORD`, `LOKI_RETENTION_DAYS`, etc.

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Follow the exact same pattern as the existing PLG secrets: add each new secret to the `env:` block of the `Deploy PLG monitoring stack` step, then add a `--set` flag in the `helm upgrade` command.
- Default fallback values using shell `${VAR:-default}` syntax should be provided (e.g., `${ALERTMANAGER_NOTIFICATIONS_ENABLED:-false}`, `${ALERTMANAGER_MIN_SEVERITY:-warning}`, `${ALERTMANAGER_NOTIFICATION_CHANNEL:-ches}`).
- CHES secrets default to empty string if not yet set: `${ALERTMANAGER_CHES_CLIENT_ID:-}`, `${ALERTMANAGER_CHES_CLIENT_SECRET:-}`.
- Teams webhook URL defaults to a placeholder: `${ALERTMANAGER_TEAMS_WEBHOOK_URL:-placeholder}`.
- The actual GitHub Environment secrets must be created manually in the repo settings for `dev`, `test`, and `prod` environments — that is an operator task, not a code task.
- Documentation of required secrets is in the REQUIREMENTS.md for this feature.
