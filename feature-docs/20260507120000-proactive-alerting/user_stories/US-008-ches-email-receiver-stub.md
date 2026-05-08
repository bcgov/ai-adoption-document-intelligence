# US-008: Implement CHES Email Notification Receiver

**As an** operator,
**I want** Alertmanager configured with a CHES (BCGov Common Hosted Email Service) receiver,
**So that** alert notifications are delivered via email when `notificationChannel` is set to `ches`.

## Acceptance Criteria

- [x] **Scenario 1**: CHES receiver block renders in the Alertmanager ConfigMap when channel is `ches`
    - **Given** the Helm chart is templated with `alertmanager.notificationChannel: ches`
    - **When** `helm template` is run
    - **Then** the Alertmanager ConfigMap contains a receiver named `ches-notifications` with CHES connection parameters populated from Helm values

- [ ] **Scenario 2**: Recipient list is sourced from Helm values
    - **Given** `alertmanager.ches.recipients` is set to a list of email addresses
    - **When** the ConfigMap is rendered
    - **Then** the receiver config references those addresses and does not hard-code any email
    - **Note**: CHES uses OAuth2/REST API (`webhook_configs`) — recipient handling depends on confirmed integration approach; deferred until test credentials provided

- [x] **Scenario 3**: CHES credentials are sourced from Helm values
    - **Given** `alertmanager.ches.clientId` and `alertmanager.ches.clientSecret` are set
    - **When** the ConfigMap is rendered
    - **Then** the receiver config references those values

- [ ] **Scenario 4**: A test alert is successfully delivered via CHES using test credentials
    - **Given** CHES test credentials are configured and `notificationsEnabled: true`
    - **When** an alert fires and routes to the `ches-notifications` receiver
    - **Then** an email is received at the configured recipient addresses with the alert name, severity, and summary
    - **Note**: Deferred — requires test credentials from team

- [x] **Scenario 5**: CHES receiver is absent when `notificationChannel` is not `ches`
    - **Given** the Helm chart is templated with `alertmanager.notificationChannel: teams`
    - **When** `helm template` is run
    - **Then** the Alertmanager ConfigMap does not contain a `ches-notifications` receiver block

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- **CHES is the primary channel.** Test credentials will be provided by the team for dev/test validation. Production credentials are a follow-on operational task.
- CHES supports an SMTP-compatible interface and/or a REST API. The receiver should use Alertmanager's `email_configs` (SMTP) if CHES exposes an SMTP endpoint, or `webhook_configs` pointing at a thin adapter if only the REST API is available. Confirm the appropriate integration approach when test credentials are handed over.
- Default `values.yaml` should have `alertmanager.ches.clientId: ""` and `alertmanager.ches.clientSecret: ""` as empty strings so the template renders safely before credentials are set.
- The `ALERTMANAGER_CHES_CLIENT_ID` and `ALERTMANAGER_CHES_CLIENT_SECRET` GitHub secrets are passed via `--set` in the workflow.
- `notificationsEnabled` defaults to `false` until CHES delivery is verified end-to-end with test credentials; the operator flips this flag once confirmed working.
- `ches` is the default `notificationChannel` in `values.yaml`.
