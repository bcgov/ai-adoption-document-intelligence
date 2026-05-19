# Alerting System

## Overview

The alerting system routes application and infrastructure alerts through Prometheus → Alertmanager → external notification channel (CHES email or Microsoft Teams). All components are deployed as part of the PLG (Prometheus, Loki, Grafana) Helm release.

```
Application Code
      │ warn/error logs (alertType in context)
      ▼
Shared Logger Hook
      │ increments counters
      ▼
Prometheus (scrapes /metrics)
      │ evaluates alert rules
      ▼
Alertmanager (routes, deduplicates, silences)
      │
      ├── notificationChannel=ches ──► ches-adapter ──► CHES /api/v1/email
      └── notificationChannel=teams ─► Teams webhook (stub — org policy blocked)
```

---

## Components

### Prometheus alert rules

Rules are defined in `deployments/alert-thresholds.ts` and auto-generated into `deployments/local/prometheus/rules/app-alerts.yml` and the Helm ConfigMap (`prometheus-rules-configmap.yaml`) by running:

```bash
npm run generate:alert-rules
```

This command runs automatically in CI before the PLG Helm deploy step.

### Alertmanager

Deployed as a StatefulSet with a 2 Gi PVC for silence/notification state. Configuration is templated via the Helm `alertmanager-configmap.yaml` template and controlled by the values below.

### ches-adapter

A small standalone Node.js service (`apps/ches-adapter/`) deployed alongside Alertmanager when `notificationChannel=ches`. It:

1. Receives the Alertmanager webhook POST payload.
2. Authenticates the request using a shared Bearer token (`CHES_ADAPTER_SECRET`).
3. Obtains a short-lived CHES OAuth2 token via `client_credentials` grant.
4. Posts an HTML email to `{CHES_HOST}/api/v1/email`.
5. Logs a `correlationId` on both the send attempt and the CHES `msgId` confirmation, enabling later delivery queries.

CHES credentials are stored in a Kubernetes Secret referenced by `chesAdapter.secretName`. Required keys:

| Key | Description |
|-----|-------------|
| `chesAdapterSecret` | Shared Bearer token between Alertmanager and ches-adapter (`CHES_ADAPTER_SECRET`) |
| `chesClientId` | CHES OAuth2 client ID |
| `chesClientSecret` | CHES OAuth2 client secret |
| `chesAuthHost` | CHES token endpoint host (e.g. `https://loginproxy.gov.bc.ca`) |
| `chesHost` | CHES API host (e.g. `https://ches.api.gov.bc.ca`) |
| `chesFromEmail` | Sender address registered with CHES |
| `chesToEmails` | Comma-separated list of recipient addresses |

---

## Configuration Flags

Alertmanager routing is controlled by Helm values set via GitHub Environment secrets in `deploy-instance.yml`:

| Helm value | Secret | Default | Description |
|---|---|---|---|
| `alertmanager.notificationsEnabled` | `ALERTMANAGER_NOTIFICATIONS_ENABLED` | `false` | Enable external notifications. Keep `false` until CHES delivery is verified. |
| `alertmanager.notificationChannel` | `ALERTMANAGER_NOTIFICATION_CHANNEL` | `ches` | Active channel: `ches` or `teams`. |
| `alertmanager.minNotificationSeverity` | `ALERTMANAGER_MIN_SEVERITY` | `warning` | Minimum severity to route externally: `warning` (warning + critical) or `critical`. |
| `alertmanager.teams.webhookUrl` | `ALERTMANAGER_TEAMS_WEBHOOK_URL` | `placeholder` | Teams connector URL (blocked by org policy — stub only). |

When `notificationsEnabled=false`, Alertmanager still runs and alerts are visible in Grafana — no external notification is sent.

---

## Adding a New Alert Rule

1. Add `alertType` to log context in application code (see [In-App Alerting](#in-app-alerting)).
2. Add a threshold entry to `deployments/alert-thresholds.ts`.
3. Regenerate rules: `npm run generate:alert-rules`.
4. The updated rules are applied on next deployment (CI runs the generator before `helm upgrade`).

Static rules that don't use the shared logger counters (e.g. HTTP error rate, slow responses) can be added directly to `deployments/alert-thresholds.ts` in the `staticRules` section.

---

## In-App Alerting

Any backend-services or Temporal worker code can raise an alert condition by logging at `warn` or `error` level with an `alertType` in the log context.

### How it works

The shared logger (`@ai-di/shared-logging`) accepts an optional `MetricsHook` callback. When `MetricsService.getMetricsHook()` is passed during logger creation, every log line that includes `{ alertType: "..." }` in its context is inspected:

- `warn` → increments `app_error_total{type, severity="warning"}` and marks the type as active.
- `error` → increments `app_error_total{type, severity="critical"}` and marks the type as active.
- `info` / `debug` → if the type was previously in error state, increments `app_recovery_total{type}` and clears the state. Also increments `app_success_total{type}` (used as denominator in error-rate rules).

### Example usage

```typescript
// backend-services: inject MetricsService and create a logger
const logger = createLogger("classifier-training", {
  metricsHook: this.metricsService.getMetricsHook(),
});

// Raise an alert condition
logger.warn("Classifier training failed", {
  alertType: "classifier_training_failed",
  classifierId: "abc123",
});

// Indicate recovery
logger.info("Classifier training succeeded", {
  alertType: "classifier_training_failed",
  classifierId: "abc123",
});
```

### Choosing a severity

| Log level | Prometheus severity | Use for |
|---|---|---|
| `warn` | `warning` | Degraded state, recoverable, non-urgent |
| `error` | `critical` | Complete failure, requires immediate attention |

The `type` string must match a rule defined in `alert-thresholds.ts`. Unmapped types still increment counters and will match the catch-all `AnyBackendServicesError` / `AnyTemporalWorkerError` rules.

---

## Silencing Alerts

Silences are created via the Alertmanager web UI (available in-cluster or via `oc port-forward`).

```bash
oc port-forward svc/<release>-plg-alertmanager 9093:9093 -n <namespace>
```

Then open `http://localhost:9093`. Use the **Silences** tab to create a silence by alert name, label matcher, and duration. Silences survive Alertmanager restarts (stored on the PVC).

---

## Local Development

Start the full monitoring stack including ches-adapter:

```bash
podman compose -f deployments/local/docker-compose.monitoring.yml up -d
```

The ches-adapter is available at `http://localhost:3003/`. Set the required env vars in a `.env` file at the repo root or export them before starting. See `apps/backend-services/.env.sample` for the full list of `CHES_*` variables.
