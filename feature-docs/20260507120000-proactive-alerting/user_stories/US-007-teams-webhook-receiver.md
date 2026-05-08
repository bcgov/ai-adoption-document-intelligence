# US-007: Stub Teams Webhook Receiver in Alertmanager Config

**As an** operator,
**I want** a Teams webhook receiver stubbed in the Alertmanager config template,
**So that** the swappable channel architecture is preserved and Teams can be activated in future if the organisational policy block is resolved, without requiring code or template changes.

## Acceptance Criteria

- [x] **Scenario 1**: Teams receiver block renders in the Alertmanager ConfigMap when channel is `teams`
    - **Given** the Helm chart is templated with `alertmanager.notificationChannel: teams`
    - **When** `helm template` is run
    - **Then** the Alertmanager ConfigMap contains a receiver named `teams-notifications` with a Teams webhook configuration block

- [x] **Scenario 2**: Teams webhook URL is sourced from Helm values
    - **Given** `alertmanager.teams.webhookUrl` is set (or defaults to a placeholder string)
    - **When** the ConfigMap is rendered
    - **Then** the webhook URL in the config matches the provided value and is not hard-coded

- [x] **Scenario 3**: Teams receiver is absent when `notificationChannel` is not `teams`
    - **Given** the Helm chart is templated with `alertmanager.notificationChannel: ches`
    - **When** `helm template` is run
    - **Then** the Alertmanager ConfigMap does not contain a `teams-notifications` receiver block

- [x] **Scenario 4**: Default `values.yaml` does not set Teams as the active channel
    - **Given** `values.yaml` is reviewed
    - **When** `alertmanager.notificationChannel` is checked
    - **Then** the default value is `ches`, not `teams`

## Priority
- [ ] High (Must Have)
- [x] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- **Teams is blocked by organisational policy** — no real webhook URL will be provided. The stub must render a valid Alertmanager config structure without errors when `alertmanager.teams.webhookUrl` is an empty string or placeholder.
- Default `values.yaml` should have `alertmanager.teams.webhookUrl: ""` so the template renders safely.
- Use Alertmanager's built-in `msteams` receiver (Alertmanager v0.27+) or `webhook_configs` as appropriate for the deployed image version.
- No end-to-end delivery test is required for this story — correct template rendering is sufficient.
- Alert template annotations (`summary`, `description`) added in US-005/US-006 will benefit Teams messages automatically if the channel is ever activated.
