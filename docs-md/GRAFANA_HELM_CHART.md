# Grafana Helm Chart

Grafana is deployed as part of the PLG (Prometheus, Loki, Grafana) observability stack via a standalone Helm chart located at `deployments/openshift/helm/plg/`.

## Chart Structure

```
deployments/openshift/helm/plg/
  Chart.yaml                         # Chart metadata
  values.yaml                        # Default values
  values-local.yaml                  # Local Docker environment overrides
  values-openshift.yaml              # OpenShift environment overrides
  dashboards/
    application-overview.json        # Application Overview Grafana dashboard JSON
  templates/
    _helpers.tpl                     # Template helper functions
    grafana-configmap.yaml           # Grafana server configuration (grafana.ini)
    grafana-dashboard-provisioner-configmap.yaml # Dashboard provisioning configuration
    grafana-dashboards-configmap.yaml # Dashboard JSON files as ConfigMap data
    grafana-datasources-configmap.yaml # Pre-provisioned data sources (Prometheus + Loki)
    grafana-deployment.yaml          # Grafana Deployment (stateless)
    grafana-service.yaml             # ClusterIP Service for Grafana
```

## Configurable Values

| Value | Description | Default |
|-------|-------------|---------|
| `grafana.image.repository` | Grafana container image | `grafana/grafana` |
| `grafana.image.tag` | Grafana image tag | `11.5.2` |
| `grafana.adminUser` | Grafana admin username | `admin` |
| `grafana.adminPassword` | Grafana admin password (override via `GRAFANA_ADMIN_PASSWORD`) | `admin` |
| `grafana.resources.requests.memory` | Memory request | `256Mi` |
| `grafana.resources.requests.cpu` | CPU request | `250m` |
| `grafana.resources.limits.memory` | Memory limit | `256Mi` |
| `grafana.resources.limits.cpu` | CPU limit | `250m` |
| `grafana.httpPort` | HTTP listen port | `3001` |

## Pre-Configured Data Sources

Grafana is provisioned with two data sources that are available immediately after deployment, with no manual setup required:

### Prometheus

- **Name**: Prometheus
- **Type**: `prometheus`
- **URL**: Resolved from the Prometheus service within the same Helm release
- **Default**: Yes (used as the default data source for metric queries)

### Loki

- **Name**: Loki
- **Type**: `loki`
- **URL**: Resolved from the Loki service within the same Helm release

Both data sources use the `proxy` access mode, meaning Grafana proxies requests to the backend services. Data sources are marked as non-editable to prevent drift from the provisioned configuration.

## Pre-Built Dashboards

Dashboards are shipped as JSON files in the `dashboards/` directory and automatically provisioned into Grafana via ConfigMaps. The provisioning pipeline works as follows:

1. Dashboard JSON files live in `deployments/openshift/helm/plg/dashboards/`.
2. The `grafana-dashboards-configmap.yaml` template embeds each JSON file into a ConfigMap using `.Files.Get`.
3. The `grafana-dashboard-provisioner-configmap.yaml` template creates the Grafana provisioning config that tells Grafana to load dashboards from `/var/lib/grafana/dashboards`.
4. The Grafana Deployment mounts both ConfigMaps so dashboards appear automatically on startup.

### Application Overview Dashboard

**File**: `dashboards/application-overview.json`
**UID**: `application-overview`

Provides an at-a-glance view of application health with four panels:

| Panel | Data Source | Query |
|-------|-------------|-------|
| Request Rate | Prometheus | `sum(rate(http_requests_total[5m]))` with per-method breakdown |
| Error Rate | Prometheus | `sum(rate(http_request_errors_total[5m]))` split by 4xx and 5xx |
| Latency Percentiles | Prometheus | `histogram_quantile(0.5/0.95/0.99, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))` |
| Active Sessions | Loki | Count of unique `sessionId` values in `backend-services` logs over 5 minutes |

The dashboard uses Grafana template variables (`prometheus_datasource` and `loki_datasource`) to reference the provisioned Prometheus and Loki data sources, making it portable across environments. Auto-refresh is set to 30 seconds with a default time range of 1 hour.

### Adding New Dashboards

To add a new dashboard:

1. Place the dashboard JSON file in `deployments/openshift/helm/plg/dashboards/`.
2. Add a new entry in `templates/grafana-dashboards-configmap.yaml` under the `data:` key:
   ```yaml
   new-dashboard.json: |-
     {{- .Files.Get "dashboards/new-dashboard.json" | nindent 4 }}
   ```
3. Run `helm lint` and `helm template` to validate.

## Authentication

Grafana uses username/password authentication. The admin credentials are configurable via Helm values:

```bash
helm upgrade --install plg ./deployments/openshift/helm/plg \
  --set grafana.adminPassword=<secure-password>
```

Sign-up is disabled. Only the configured admin account can log in by default.

## Network Access

Grafana is deployed as a ClusterIP service and is not exposed via an OpenShift Route. Developers access it via port-forwarding, following the same pattern used for the Temporal UI:

```bash
kubectl port-forward svc/<release>-plg-grafana 3001:3001 -n <namespace>
```

Then open `http://localhost:3001` in a browser.

## Deployment

### OpenShift

```bash
helm upgrade --install plg ./deployments/openshift/helm/plg \
  -f ./deployments/openshift/helm/plg/values-openshift.yaml \
  --set grafana.adminPassword=<secure-password> \
  -n <namespace>
```

### Local Development

```bash
helm upgrade --install plg ./deployments/openshift/helm/plg \
  -f ./deployments/openshift/helm/plg/values-local.yaml
```

### Custom Overrides

Any value can be overridden via `--set` flags:

```bash
helm upgrade --install plg ./deployments/openshift/helm/plg \
  --set grafana.adminPassword=mysecret \
  --set grafana.resources.limits.memory=512Mi
```

## Architecture Notes

- Grafana runs as a single-replica Deployment (not a StatefulSet) because it does not require persistent storage for this use case.
- Data sources are provisioned via Grafana's file-based provisioning mechanism using ConfigMaps mounted into `/etc/grafana/provisioning/datasources`.
- The admin password is passed via the `GF_SECURITY_ADMIN_PASSWORD` environment variable.
- Config changes trigger automatic pod restarts via `checksum/config`, `checksum/datasources`, `checksum/dashboards`, and `checksum/dashboard-provisioner` annotations on the Deployment pod template.
- The existing Kustomize deployment for the application is not modified. PLG is a separate Helm release.
