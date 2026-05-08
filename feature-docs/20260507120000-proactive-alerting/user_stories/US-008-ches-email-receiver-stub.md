# US-008: Implement CHES Email Notification Receiver

**As an** operator,
**I want** Alertmanager configured with a CHES receiver via the standalone `ches-adapter` service,
**So that** alert notifications are delivered via email when `notificationChannel` is set to `ches`.

## Acceptance Criteria

- [x] **Scenario 1**: CHES receiver block renders in the Alertmanager ConfigMap when channel is `ches`
    - **Given** the Helm chart is templated with `alertmanager.notificationChannel: ches`
    - **When** `helm template` is run
    - **Then** the Alertmanager ConfigMap contains a receiver named `ches-notifications` with a `webhook_configs` entry pointing at the ches-adapter service URL

- [x] **Scenario 2**: Recipient list and CHES credentials are stored in a Kubernetes Secret
    - **Given** a Kubernetes Secret named `ches-adapter-secrets` is created in the namespace
    - **When** the ches-adapter pod starts
    - **Then** it reads `chesToEmails`, `chesClientId`, `chesClientSecret`, `chesAuthHost`, `chesHost`, `chesFromEmail`, and `webhookSecret` from the Secret via environment variables

- [x] **Scenario 3**: Alertmanager authenticates to ches-adapter using the shared webhook secret
    - **Given** `alertmanager.ches.webhookSecret` is set in Helm values
    - **When** Alertmanager fires an alert to the ches-adapter
    - **Then** the request includes `Authorization: Bearer <webhookSecret>` and ches-adapter validates it before forwarding to CHES

- [ ] **Scenario 4**: A test alert is successfully delivered via CHES using test credentials
    - **Given** CHES test credentials are configured and `notificationsEnabled: true`
    - **When** an alert fires and routes to the `ches-notifications` receiver
    - **Then** an email is received at the configured recipient addresses with the alert name, severity, and summary
    - **Note**: Deferred — requires CHES test credentials to be provisioned in the target environment

- [x] **Scenario 5**: CHES receiver is absent when `notificationChannel` is not `ches`
    - **Given** the Helm chart is templated with `alertmanager.notificationChannel: teams`
    - **When** `helm template` is run
    - **Then** the Alertmanager ConfigMap does not contain a `ches-notifications` receiver block

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- CHES integration uses a standalone `apps/ches-adapter` Node.js service (not Alertmanager's built-in email/smtp config). Alertmanager posts its webhook payload to ches-adapter via `webhook_configs`.
- ches-adapter authenticates Alertmanager requests via a shared Bearer token (`CHES_ADAPTER_SECRET`), then authenticates to CHES using OAuth2 `client_credentials` grant.
- All CHES credentials (`chesClientId`, `chesClientSecret`, `chesAuthHost`, `chesHost`, `chesFromEmail`, `chesToEmails`, `webhookSecret`) are stored in a single Kubernetes Secret referenced by `chesAdapter.secretName` (default: `ches-adapter-secrets`). The operator creates this secret before deploying.
- `alertmanager.ches.webhookSecret` in Helm values is passed as `--set` from `ALERTMANAGER_CHES_ADAPTER_SECRET` GitHub secret; it is the same value stored as `webhookSecret` in the k8s Secret.
- `notificationsEnabled` defaults to `false` until CHES delivery is verified end-to-end.
