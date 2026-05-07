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

- Alertmanager uses CHES as an SMTP-compatible relay or via its REST API (to be determined based on CHES onboarding)
- Client credentials (`CHES_CLIENT_ID`, `CHES_CLIENT_SECRET`) are **not yet available** — the integration is designed as the primary target but CHES config is stubbed/templated so Teams can be used in the interim
- Recipient list: a fixed list of email addresses defined in Helm values (e.g., `alertmanager.ches.recipients`)
- This is a **prerequisite dependency**: CHES onboarding must be completed before email delivery can be activated

### Microsoft Teams Webhook

- Alertmanager uses the Teams webhook receiver (via the `msteams` integration or equivalent)
- Webhook URL is a single private channel webhook, stored as a Helm value / Secret
- Same fixed recipient model — all alerts go to the same channel
- Teams is the **interim default** until CHES credentials are available

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

The following new GitHub Environment secrets must be added for each environment (`dev`, `test`, `prod`) and wired through the `Deploy Instance` workflow as `--set` flags on the PLG `helm upgrade` command. They follow the same pattern as existing PLG secrets (`GRAFANA_ADMIN_PASSWORD`, `LOKI_RETENTION_DAYS`, etc.).

| Secret Name | Purpose | Example Value |
|-------------|---------|---------------|
| `ALERTMANAGER_NOTIFICATION_CHANNEL` | Which channel to route notifications to | `teams` or `ches` |
| `ALERTMANAGER_NOTIFICATIONS_ENABLED` | Whether to deliver external notifications; set `false` in dev/test to suppress alert fatigue | `true` / `false` |
| `ALERTMANAGER_MIN_SEVERITY` | Minimum severity level that triggers external notification | `warning` or `critical` |
| `ALERTMANAGER_TEAMS_WEBHOOK_URL` | Teams private channel incoming webhook URL (used when channel = `teams`) | `https://...` |
| `ALERTMANAGER_RECIPIENTS` | Comma-separated list of recipient email addresses (used when channel = `ches`) | `user@example.com,...` |
| `ALERTMANAGER_CHES_CLIENT_ID` | CHES OAuth client ID (used when channel = `ches`; not yet available — stub until onboarding complete) | — |
| `ALERTMANAGER_CHES_CLIENT_SECRET` | CHES OAuth client secret (same) | — |

**Notes:**
- `GRAFANA_PVC_SIZE` is **not** a configurable secret — Grafana's PVC is hardcoded to `1Gi` in `values.yaml`. Unlike Loki and Prometheus, Grafana only stores its SQLite database (alert annotations, dashboard state) which stays small regardless of environment.
- CHES secrets are placeholders until BCGov CHES onboarding is complete. `ALERTMANAGER_NOTIFICATION_CHANNEL=teams` should be the default until then.

---

## Out of Scope / Assumptions

- **CHES onboarding** is a prerequisite not owned by this ticket. Teams webhook is the interim delivery method.
- **OpenShift User Workload Monitoring** being enabled is assumed; verification is a prerequisite.
- No per-user or per-group alert subscriptions.
- No in-app UI for alert management — Grafana and Alertmanager UIs are the operator interfaces.
- No automated CI/CD silence integration.
- Alert routing by severity (e.g., `critical` → email, `warning` → Teams) is explicitly excluded — all alerts go to one configured channel.
