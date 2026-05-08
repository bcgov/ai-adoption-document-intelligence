# Proactive Alerting System — Requirements

## Overview

Set up a proactive alerting system for system health across infrastructure and application layers. Alerts are evaluated by Prometheus, routed through Alertmanager, and delivered to an external notification channel (CHES email or Microsoft Teams webhook). In-app code in the backend and Temporal workers can also manually raise alert conditions via custom Prometheus metrics.

---

## Scope

- Prometheus alert rule definitions (infrastructure and application-level)
- Alertmanager deployment and configuration (local Docker and OpenShift Helm)
- Swappable external notification channel support (CHES email and Teams webhook)
- Custom in-app Prometheus metric for manual alert flagging from backend/Temporal
- Grafana persistent storage for alert history
- OpenShift PrometheusRule CRDs for infrastructure-level alerts (CPU, memory, pod errors)

---

## Alert Sources

### Infrastructure-Level Alerts (OpenShift User Workload Monitoring)

Delivered via **OpenShift User Workload Monitoring** (OCP built-in). Alert rules are defined as `PrometheusRule` CRDs deployed into the application namespace. OpenShift's cluster-level Prometheus evaluates these rules and fires into the project's Alertmanager.

**Assumption**: User workload monitoring is enabled on the target OpenShift cluster (on by default in OCP 4.6+). This must be confirmed before deployment.

Defined thresholds (same across all environments; see "Environment Flags" below for disabling):

| Alert | Condition | Severity |
|-------|-----------|----------|
| High CPU usage | Pod CPU usage > 80% | `warning` |
| High memory usage | Pod memory usage > 90% | `critical` |
| Pod in error state | Pod in `CrashLoopBackOff` or `OOMKilled` | `critical` |
| Temporal task queue depth | `temporal_task_queue_depth > 1000` | `warning` |

### Application-Level Alerts (Custom Prometheus Metric)

A new Gauge metric `app_alert_active` is added to the backend `MetricsService`:

```
app_alert_active{type="<alert_type>", severity="<info|warning|critical>"}
```

- Value `1` = alert active, `0` = alert cleared
- `type` label is extensible; initial values to be defined at implementation time (at minimum one general-purpose type; e.g., `"workflow_activity_failed"`)
- Backend NestJS services and Temporal activities set/clear the gauge via `MetricsService` methods (`recordAlert(type, severity)` and `clearAlert(type)`)
- A Prometheus alert rule fires when `app_alert_active > 0` for a qualifying severity

### Existing Application Metrics (from `MetricsService`)

Additional alert rules are defined over already-exposed metrics:

| Alert | Condition | Severity |
|-------|-----------|----------|
| High HTTP error rate | `rate(http_request_errors_total[5m]) > threshold` | `warning` |
| Slow HTTP responses | `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 5s` | `warning` |
| High Node.js heap usage | `process_heap_bytes / process_heap_size_bytes > 0.9` | `warning` |

---

## Alertmanager

### Deployment

Alertmanager is added to:
- `deployments/local/docker-compose.monitoring.yml` — new service alongside Prometheus
- `deployments/openshift/helm/plg/` — new StatefulSet, Service, and ConfigMap templates

The Prometheus ConfigMap gains an `alerting:` block pointing at the Alertmanager service and a `rule_files:` section referencing alert rule files.

### Notification Channel Selection

Controlled by a **Helm value**:

```yaml
alertmanager:
  notificationChannel: teams   # or: ches
```

- Both CHES and Teams are implemented as distinct receiver configs in the Alertmanager configuration template
- A Helm template conditional renders only the selected receiver
- All alerts route to the single configured channel regardless of severity (no per-severity routing)
- Channel can be changed by redeploying the Helm release with a different value

### CHES (BCGov Email Service)

- CHES is the **primary notification channel**. Alertmanager uses CHES as an SMTP-compatible relay or via its REST API (to be determined based on CHES onboarding).
- Test credentials will be provided for development and integration testing.
- Recipient list: a fixed list of email addresses defined in Helm values (e.g., `alertmanager.ches.recipients`).
- Until CHES is confirmed working, `notificationsEnabled` defaults to `false` so no external notifications fire.

### Microsoft Teams Webhook

- Teams is **stubbed** as a fallback receiver in the Helm config template.
- Due to an organizational policy block on setting up webhooks in Teams channels, Teams cannot be used as an active notification channel at this time.
- The Teams receiver block is kept in the template to preserve the swappable architecture in case the block is resolved in future, but `notificationChannel` will never default to `teams`.
- No real Teams webhook URL is expected to be provided; the stub renders with a placeholder value.

### Severity Filtering

Three alert severity levels: `info`, `warning`, `critical`

- Only alerts with severity `warning` or `critical` are routed to the external notification channel
- `info`-severity alerts are visible in Prometheus/Grafana but do not trigger external notifications
- The minimum notification severity is configurable via a Helm value:
  ```yaml
  alertmanager:
    minNotificationSeverity: warning  # or: critical
  ```

---

## Environment Flags

All alert rules are defined the same across environments. A Helm value controls whether Alertmanager routes notifications externally:

```yaml
alertmanager:
  notificationsEnabled: true  # set to false to suppress external delivery in dev/test
```

When `false`, Alertmanager is still deployed (alerts still fire and are visible in Grafana), but no external notifications are sent. This prevents alert fatigue in non-production environments.

---

## Alert History

Grafana is given a **Persistent Volume Claim (1Gi)** for its internal SQLite database, enabling alert annotation history to survive pod restarts.

- Added to the Helm chart: new PVC template for Grafana, mounted at `/var/lib/grafana`
- `pvcSize` configurable via `grafana.pvcSize` Helm value (default `1Gi`)
- If PVC provisioning is unavailable on the target cluster, this is treated as a deployment prerequisite to resolve with the cluster admin — it is not removed or made optional
- Prometheus TSDB (already PV-backed) additionally retains the raw `ALERTS{}` time series for threshold-breach history

---

## Maintenance Silencing

- Alert silences are created **manually** via the Alertmanager web UI before planned deployments or maintenance windows
- No automated silence integration with CI/CD pipelines
- Alertmanager UI is accessible within the cluster (or via port-forward)

---

## Acceptance Criteria

- [ ] Alert rules fire when thresholds are breached (CPU >80%, memory >90%, task queue depth >1000, pod crash loops, HTTP error rate spike, heap exhaustion, `app_alert_active > 0`)
- [ ] Alertmanager routes `warning` and `critical` alerts to the configured external channel (Teams or CHES) when `notificationsEnabled: true`
- [ ] Switching `notificationChannel` between `ches` and `teams` via Helm value produces correct Alertmanager config without code changes
- [ ] `notificationsEnabled: false` suppresses external delivery without disabling alert evaluation
- [ ] Backend `MetricsService` exposes `app_alert_active` gauge with `recordAlert` and `clearAlert` methods
- [ ] At least one Temporal activity and one backend service call `recordAlert`/`clearAlert` to demonstrate the in-app mechanism
- [ ] Grafana retains alert annotation history across pod restarts (PVC mounted)
- [ ] `PrometheusRule` CRDs are deployed to the OpenShift namespace for infrastructure-level alerts
- [ ] All new config is documented in `/docs-md/`

---

## New Environment Variables / Secrets

### GitHub Environment secrets (wired as `--set` flags in `deploy-instance.yml`)

The following secrets are set per environment (`dev`, `test`, `prod`) and passed to the PLG `helm upgrade` command as `--set` flags, following the same pattern as `GRAFANA_ADMIN_PASSWORD`, `LOKI_RETENTION_DAYS`, etc.

| Secret Name | Purpose | Example Value |
|-------------|---------|---------------|
| `ALERTMANAGER_NOTIFICATION_CHANNEL` | Which channel to route notifications to | `ches` (primary) or `teams` (stub) |
| `ALERTMANAGER_NOTIFICATIONS_ENABLED` | Whether to deliver external notifications; defaults to `false` until CHES is confirmed working | `true` / `false` |
| `ALERTMANAGER_MIN_SEVERITY` | Minimum severity level that triggers external notification | `warning` or `critical` |
| `ALERTMANAGER_CHES_ADAPTER_SECRET` | Shared Bearer token sent by Alertmanager to the ches-adapter service | any random secret string |
| `ALERTMANAGER_TEAMS_WEBHOOK_URL` | Teams webhook URL placeholder (channel blocked by org policy; kept for future use) | `placeholder` |

### Kubernetes Secret (provisioned manually before deployment)

CHES credentials are **not** passed as `--set` flags. They are stored in a Kubernetes Secret in the target namespace, referenced by the Helm value `chesAdapter.secretName` (default: `ches-adapter-secrets`). This secret must be created by the operator before deploying with `notificationChannel=ches`:

```bash
oc create secret generic ches-adapter-secrets \
  --from-literal=webhookSecret=<CHES_ADAPTER_SECRET value> \
  --from-literal=chesClientId=<CHES client ID> \
  --from-literal=chesClientSecret=<CHES client secret> \
  --from-literal=chesAuthHost=https://loginproxy.gov.bc.ca \
  --from-literal=chesHost=https://ches.api.gov.bc.ca \
  --from-literal=chesFromEmail=<sender address registered with CHES> \
  --from-literal=chesToEmails=<comma-separated recipient list>
```

**Notes:**
- `GRAFANA_PVC_SIZE` is **not** a configurable secret — Grafana's PVC is hardcoded to `1Gi` in `values.yaml`. Unlike Loki and Prometheus, Grafana only stores its SQLite database (alert annotations, dashboard state) which stays small regardless of environment.
- The default for `ALERTMANAGER_NOTIFICATION_CHANNEL` is `ches`. `ALERTMANAGER_NOTIFICATIONS_ENABLED` defaults to `false` until CHES delivery is verified end-to-end.
- Teams is structurally present in the template but is blocked by an organizational policy preventing webhook setup in Teams channels. It is kept as a stub only.

---

## Out of Scope / Assumptions

- **CHES onboarding** is a prerequisite for active external notifications. Test credentials will be provided; the `notificationsEnabled` flag defaults to `false` until CHES delivery is verified end-to-end.
- **OpenShift User Workload Monitoring** being enabled is assumed; verification is a prerequisite.
- No per-user or per-group alert subscriptions.
- No in-app UI for alert management — Grafana and Alertmanager UIs are the operator interfaces.
- No automated CI/CD silence integration.
- Alert routing by severity is explicitly excluded — all alerts at or above `minNotificationSeverity` go to one configured channel.
- Microsoft Teams is structurally stubbed in the Helm template but is blocked by organizational policy and will not be used as an active channel.
