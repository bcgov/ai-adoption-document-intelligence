# US-009: Swappable Channel Selection and Severity / Enabled Flags

**As an** operator,
**I want** to control notification channel, enabled state, and minimum severity via Helm values,
**So that** I can configure alert delivery per environment without code or template changes.

## Acceptance Criteria

- [x] **Scenario 1**: `notificationsEnabled: false` suppresses routing to any external receiver
    - **Given** the Helm chart is templated with `alertmanager.notificationsEnabled: false`
    - **When** `helm template` is run
    - **Then** the Alertmanager route config sends all alerts to a `null` (drop) receiver instead of any external channel

- [x] **Scenario 2**: `notificationsEnabled: true` routes alerts to the configured channel receiver
    - **Given** the Helm chart is templated with `alertmanager.notificationsEnabled: true` and `alertmanager.notificationChannel: ches`
    - **When** `helm template` is run
    - **Then** the Alertmanager route config sends alerts to the `ches-notifications` receiver

- [x] **Scenario 3**: Alerts below `minNotificationSeverity` are not forwarded externally
    - **Given** `alertmanager.minNotificationSeverity: warning` and `notificationsEnabled: true`
    - **When** an `info`-severity alert fires
    - **Then** the Alertmanager routing tree matches it to the `null` receiver, not the external channel

- [x] **Scenario 4**: Alerts at or above `minNotificationSeverity` are forwarded
    - **Given** `alertmanager.minNotificationSeverity: warning` and `notificationsEnabled: true`
    - **When** a `warning`-severity alert fires
    - **Then** the Alertmanager routing tree matches it to the configured external receiver

- [x] **Scenario 5**: Switching `notificationChannel` and redeploying changes the active receiver
    - **Given** the Helm release is deployed with `notificationChannel: ches`
    - **When** `helm upgrade` is run with `notificationChannel: teams`
    - **Then** the updated ConfigMap contains the `teams-notifications` receiver block and the route points to it

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- The Alertmanager `route:` tree in the ConfigMap template uses Helm conditionals: if `notificationsEnabled` is false, the default receiver is `null`; if true, it is the selected channel receiver.
- Severity filtering is implemented via `match_re` or `matchers` on the route, matching `severity=~"warning|critical"` (or the configured threshold) to the external receiver, with a catch-all `null` route for everything else.
- `minNotificationSeverity: warning` means `warning` and `critical` both route externally; `minNotificationSeverity: critical` means only `critical` does.
- New `values.yaml` defaults: `alertmanager.notificationsEnabled: false`, `alertmanager.minNotificationSeverity: warning`, `alertmanager.notificationChannel: ches`.
- `notificationsEnabled` defaults to `false` so no external notifications fire until CHES delivery is verified end-to-end with test credentials.
- The `ALERTMANAGER_NOTIFICATIONS_ENABLED`, `ALERTMANAGER_MIN_SEVERITY`, and `ALERTMANAGER_NOTIFICATION_CHANNEL` GitHub secrets are wired through the deploy workflow as `--set` overrides (addressed in US-011).
