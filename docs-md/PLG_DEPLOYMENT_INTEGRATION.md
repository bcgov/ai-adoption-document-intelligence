# PLG Deployment Integration

## Overview

The PLG (Prometheus, Loki, Grafana, Alertmanager) monitoring stack is deployed as a separate Helm release alongside the application. It does not modify or interfere with the existing Kustomize-based application deployment. PLG deployment is integrated into both the GitHub Actions CI/CD pipeline and the local deployment scripts.

## Deployment Methods

### GitHub Actions (CI/CD)

The `build-apps.yml` workflow includes a `deploy-plg` job that runs after application images are built. This job:

1. Checks out the repository to access the Helm chart at `deployments/openshift/helm/plg/`
2. Installs the Helm and `oc` CLIs
3. Authenticates to OpenShift using environment secrets
4. Runs `helm upgrade --install` with the OpenShift values file

The job runs regardless of whether application images were built (it depends on `build-apps` succeeding or being skipped), ensuring the PLG stack stays up to date even when no application code changed.

#### Required GitHub Environment Secrets

| Secret | Description |
|--------|-------------|
| `OPENSHIFT_SERVER` | OpenShift API server URL |
| `OPENSHIFT_TOKEN` | Service account token for the target namespace |
| `OPENSHIFT_NAMESPACE` | Target namespace (e.g., `fd34fb-dev`) |
| `GRAFANA_ADMIN_PASSWORD` | Grafana admin password (falls back to `admin` if unset) |

### CI Deployment (`deploy-instance.yml`)

The `Deploy Instance` GitHub workflow deploys the PLG stack as part of the `Deploy to OpenShift` job, after applying the Kustomize overlay and creating instance secrets. The step:

1. Deletes immutable PLG StatefulSets (Loki, Prometheus, Alertmanager) with `--cascade=orphan` when they already exist — see [Upgrade impact on logging](#upgrade-impact-on-logging).
2. Reads PLG-specific configuration from the `test` or `prod` GitHub environment secrets (populated from `dev.env`/`prod.env`)
3. Derives instance-specific Prometheus scrape targets from the instance name
4. Runs `helm upgrade --install` with environment-specific values passed via `--set` flags

PLG Helm failures fail the deploy step (`--wait --timeout 300s`).

#### Instance-Specific Helm Release

Each application instance gets its own PLG Helm release named `<instance>-plg`. Prometheus scrape targets are configured to point at the instance-specific Kubernetes service names (e.g., `my-instance-backend-services`, `my-instance-temporal`).

### Teardown (`oc-teardown.sh`)

The `scripts/oc-teardown.sh` script includes a step (3b) that uninstalls the PLG Helm release for the instance being torn down. If Helm is not installed or no PLG release exists, the step is skipped gracefully.

## Environment Configuration

PLG-specific variables are configured in the same environment profile files used by the application (`deployments/openshift/config/<env>.env`). They follow the existing config merge pattern: profile defaults can be overridden by instance-specific files.

| Variable | Default | Description |
|----------|---------|-------------|
| `GRAFANA_ADMIN_PASSWORD` | `admin` | Grafana admin login password |
| `LOKI_RETENTION_DAYS` | `30` | Log retention period in days |
| `LOKI_PVC_SIZE` | `10Gi` | Persistent volume size for Loki data |
| `PROMETHEUS_PVC_SIZE` | `10Gi` | Persistent volume size for Prometheus TSDB |
| `METRICS_SCRAPE_INTERVAL` | `15s` | How often Prometheus scrapes targets |
| `ALERTMANAGER_NOTIFICATION_CHANNEL` | `ches` | Active notification channel: `ches` or `teams` |
| `ALERTMANAGER_NOTIFICATIONS_ENABLED` | `false` | Whether Alertmanager routes alerts externally |
| `ALERTMANAGER_MIN_SEVERITY` | `warning` | Minimum severity for external notification: `warning` or `critical` |
| `ALERTMANAGER_CHES_ADAPTER_SECRET` | `""` | Shared Bearer token between Alertmanager and ches-adapter |
| `ALERTMANAGER_TEAMS_WEBHOOK_URL` | `placeholder` | Teams webhook URL (org policy stub) |

These variables are read by the `Deploy Instance` workflow from the environment secrets and passed to Helm as `--set` overrides on top of the `values-openshift.yaml` base.

CHES credentials (`chesClientId`, `chesClientSecret`, `chesAuthHost`, `chesHost`, `chesFromEmail`, `chesToEmails`) are stored in a Kubernetes Secret referenced by `chesAdapter.secretName` (default: `ches-adapter-secrets`). This secret must be created manually in the target namespace before deploying with `notificationChannel=ches`. See [ALERTING.md](ALERTING.md) for the required secret keys.

## Separation from Kustomize

The PLG deployment is completely independent of the Kustomize-based application deployment:

- PLG resources are managed by Helm, not Kustomize
- PLG uses its own labels (`app.kubernetes.io/managed-by: Helm`, `app.kubernetes.io/part-of: plg`)
- No Kustomize base or overlay files are modified for PLG
- If PLG deployment fails, the application deployment is unaffected

## Prometheus RBAC

Prometheus uses Kubernetes pod service discovery (`kubernetes_sd_configs`) to scrape `backend-services` and `temporal-worker` pods by IP across replicas. This requires permission to list and watch pods in the namespace.

The chart creates a dedicated `ServiceAccount`, `Role` (pods: `get`/`list`/`watch`), and `RoleBinding` for the Prometheus StatefulSet. These are scoped to the release namespace only. The `default` service account is not used — it has no pod-list permissions on OpenShift.

## ches-adapter and Alertmanager

The ches-adapter Deployment, Service, PodDisruptionBudget, and sidecar ConfigMaps are only rendered when **both** `alertmanager.notificationsEnabled: true` and `alertmanager.notificationChannel: "ches"`. When notifications are disabled (the default), none of these resources are created and no ches-adapter image is required.

Similarly, the `ches-notifications` and `teams-notifications` receivers in the Alertmanager config are only emitted when `notificationsEnabled: true`. This prevents Alertmanager from failing to start due to empty webhook URL validation when notifications are off.

## Grafana Storage

Grafana stores its SQLite database and alert history on a `ReadWriteOnce` PersistentVolumeClaim. The Deployment uses `strategy: Recreate` rather than the default `RollingUpdate`, so the old pod is terminated before the new one starts. This prevents `Multi-Attach` errors caused by two pods competing for the same RWO volume during an upgrade.

## Upgrade impact on logging

Before each PLG Helm upgrade, the deploy pipeline deletes existing Loki, Prometheus, and Alertmanager StatefulSets with `oc delete statefulset ... --cascade=orphan`. This preserves PVCs and running pods while allowing Helm to recreate StatefulSets when immutable fields (such as `volumeClaimTemplates`) change.

| Layer | Disruption during upgrade? |
|-------|---------------------------|
| Application stdout / PVC logs | **No** — apps and log tee sidecars keep writing |
| Promtail → Loki ingest | **Brief yes** — Loki may restart during `helm upgrade --wait`; Promtail buffers or backs off |
| Grafana log viewing | **Brief yes** — Grafana `Recreate` strategy terminates the old pod before the new one is ready |
| Historical Loki data | **No** — PVCs are preserved |

The delete step itself is low-disruption (`--cascade=orphan` keeps pods running). Disruption is most likely during Helm reconciliation (bounded by `--timeout 300s` in CI). Application logging to stdout is unaffected regardless of Loki health.

The same pre-delete logic is available locally via `scripts/lib/plg-pre-delete.sh`, invoked from `scripts/oc-deploy-instance.sh` before Helm upgrade.

## Accessing Grafana

Grafana is not exposed via an OpenShift Route. Access it via port-forwarding:

```bash
# For instance-specific deployments (each instance gets its own PLG release)
oc port-forward svc/<instance>-plg-grafana 3001:3001 -n <namespace>
```

Then open `http://localhost:3001` and log in with `admin` / `<GRAFANA_ADMIN_PASSWORD>`.

## Files

| File | Purpose |
|------|---------|
| `deployments/openshift/helm/plg/` | PLG Helm chart (templates, values) |
| `deployments/openshift/helm/plg/values-openshift.yaml` | OpenShift-specific value overrides |
| `deployments/openshift/config/dev.env.example` | Dev environment config template (includes PLG variables) |
| `deployments/openshift/config/prod.env.example` | Prod environment config template (includes PLG variables) |
| `.github/workflows/deploy-instance.yml` | CI workflow that deploys app + PLG |
| `scripts/oc-teardown.sh` | Teardown script (uninstalls PLG release for the instance) |
| `scripts/lib/plg-pre-delete.sh` | Deletes immutable PLG StatefulSets before Helm upgrade |
| `scripts/lib/wait-for-rollouts.sh` | Rollout restart/wait; fails on rollout timeout with failure diagnostics |
