# US-011: Wire Alertmanager Secrets into deploy-instance.yml Workflow

**As a** developer,
**I want** the new Alertmanager configuration values passed as `--set` flags in the `deploy-instance.yml` GitHub Actions workflow,
**So that** each environment receives its own notification config automatically on every deployment without manual Helm commands.

## Acceptance Criteria

- [x] **Scenario 1**: Core Alertmanager flags are passed to the `helm upgrade` command
    - **Given** `ALERTMANAGER_NOTIFICATION_CHANNEL`, `ALERTMANAGER_NOTIFICATIONS_ENABLED`, and `ALERTMANAGER_MIN_SEVERITY` are set as GitHub Environment secrets
    - **When** the `Deploy PLG monitoring stack` step runs
    - **Then** the `helm upgrade` command includes `--set alertmanager.notificationChannel=...`, `--set alertmanager.notificationsEnabled=...`, and `--set alertmanager.minNotificationSeverity=...`

- [x] **Scenario 2**: ches-adapter bearer secret is provisioned as a Kubernetes Secret
    - **Given** `ALERTMANAGER_CHES_ADAPTER_SECRET` is set as a GitHub Environment secret
    - **When** the `Create ches-adapter secret` and `Create alertmanager webhook secret` steps run
    - **Then** the bearer token is written to Kubernetes Secrets via `--from-env-file` / `--from-file` (never on the process command line), and Alertmanager reads it from a mounted file via `credentials_file:`
    - **Note**: Other CHES credentials (`chesClientId`, `chesClientSecret`, `chesAuthHost`, `chesHost`, `chesFromEmail`, `toEmails`) are also written to the same `<instance>-ches-adapter-secrets` Kubernetes Secret by the workflow

- [x] **Scenario 3**: Teams webhook URL placeholder is passed for stub completeness
    - **Given** `ALERTMANAGER_TEAMS_WEBHOOK_URL` is set as a GitHub Environment secret (may be a placeholder string)
    - **When** the `Deploy PLG monitoring stack` step runs
    - **Then** the `helm upgrade` command includes `--set alertmanager.teams.webhookUrl=...`

- [x] **Scenario 4**: New secrets are declared in the `Deploy PLG monitoring stack` step's `env:` block
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
- The ches-adapter webhook secret (`ALERTMANAGER_CHES_ADAPTER_SECRET`) is the only CHES-related value passed via `--set`. All other CHES credentials are stored in a k8s Secret (`ches-adapter-secrets`) provisioned by the operator — they are not GitHub Environment secrets and must not be passed as `--set` flags.
- Teams webhook URL defaults to a placeholder: `${ALERTMANAGER_TEAMS_WEBHOOK_URL:-placeholder}`.
- The actual GitHub Environment secrets must be created manually in the repo settings for `dev`, `test`, and `prod` environments — that is an operator task, not a code task.
- Documentation of required secrets is in the REQUIREMENTS.md for this feature.
