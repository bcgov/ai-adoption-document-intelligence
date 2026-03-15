# Loki Helm Chart

Loki is deployed as part of the PLG (Prometheus, Loki, Grafana) observability stack via a standalone Helm chart located at `deployments/openshift/helm/plg/`.

## Chart Structure

```
deployments/openshift/helm/plg/
  Chart.yaml                         # Chart metadata
  values.yaml                        # Default values
  values-local.yaml                  # Local Docker environment overrides
  values-openshift.yaml              # OpenShift environment overrides
  templates/
    _helpers.tpl                     # Template helper functions
    loki-configmap.yaml              # Loki server configuration
    loki-statefulset.yaml            # Loki StatefulSet deployment
    loki-service.yaml                # ClusterIP Service for Loki
    prometheus-configmap.yaml        # Prometheus server configuration
    prometheus-statefulset.yaml      # Prometheus StatefulSet deployment
    prometheus-service.yaml          # ClusterIP Service for Prometheus
```

## Configurable Values

| Value | Description | Default |
|-------|-------------|---------|
| `loki.image.repository` | Loki container image | `grafana/loki` |
| `loki.image.tag` | Loki image tag | `3.4.0` |
| `loki.retentionDays` | Log retention period in days | `30` |
| `loki.pvcSize` | PVC storage size | `10Gi` |
| `loki.storageClassName` | Storage class (empty = cluster default) | `""` |
| `loki.resources.requests.memory` | Memory request | `256Mi` |
| `loki.resources.requests.cpu` | CPU request | `500m` |
| `loki.resources.limits.memory` | Memory limit | `256Mi` |
| `loki.resources.limits.cpu` | CPU limit | `500m` |
| `loki.httpPort` | HTTP listen port | `3100` |

## NDJSON Log Parsing

Loki is configured to work with the NDJSON structured logs produced by `@ai-di/shared-logging`. Loki natively parses JSON log lines, making the following fields queryable via LogQL:

- `timestamp` (ISO 8601)
- `level` (debug, info, warn, error)
- `service` (e.g., "backend-services", "temporal-worker")
- `requestId` (UUID)
- `userId` (from resolved identity)
- `sessionId` (from Keycloak session_state)
- `clientIp` (client IP address)
- `method`, `path`, `statusCode` (HTTP request details)
- `durationMs` (request duration)

LogQL queries can extract these fields using the `json` parser:

```logql
{service="backend-services"} | json | level="error"
{service="backend-services"} | json | sessionId="<uuid>"
{service="backend-services"} | json | statusCode >= 500
```

## Log Retention

Retention is enforced by the Loki compactor, which runs on a 10-minute interval and deletes chunks older than the configured retention period. The default retention period is 30 days (720 hours).

To change the retention period, override `loki.retentionDays`:

```bash
helm upgrade plg ./deployments/openshift/helm/plg --set loki.retentionDays=14
```

## Deployment

### OpenShift

```bash
helm upgrade --install plg ./deployments/openshift/helm/plg \
  -f ./deployments/openshift/helm/plg/values-openshift.yaml \
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
  --set loki.pvcSize=20Gi \
  --set loki.retentionDays=60 \
  --set loki.resources.limits.memory=512Mi
```

## Architecture Notes

- Loki runs as a single-replica StatefulSet in monolithic mode (`-target=all`).
- Data is persisted to a PVC using the TSDB store with filesystem object storage.
- The existing Kustomize deployment for the application is not modified. PLG is a separate Helm release.
- Loki is not exposed via an OpenShift Route; access is via in-cluster services or port-forwarding.
- Log collection is handled by Promtail (configured separately) which sends logs to Loki's push API.
