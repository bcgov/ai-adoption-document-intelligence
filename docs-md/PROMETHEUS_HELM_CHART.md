# Prometheus Helm Chart

Prometheus is deployed as part of the PLG (Prometheus, Loki, Grafana) observability stack via a standalone Helm chart located at `deployments/openshift/helm/plg/`.

## Chart Structure

```
deployments/openshift/helm/plg/
  Chart.yaml                         # Chart metadata
  values.yaml                        # Default values
  values-local.yaml                  # Local Docker environment overrides
  values-openshift.yaml              # OpenShift environment overrides
  templates/
    _helpers.tpl                     # Template helper functions
    prometheus-configmap.yaml        # Prometheus server configuration with scrape targets
    prometheus-statefulset.yaml      # Prometheus StatefulSet deployment with PVC
    prometheus-service.yaml          # ClusterIP Service for Prometheus
```

## Configurable Values

| Value | Description | Default |
|-------|-------------|---------|
| `prometheus.image.repository` | Prometheus container image | `prom/prometheus` |
| `prometheus.image.tag` | Prometheus image tag | `v3.2.1` |
| `prometheus.retentionDays` | TSDB data retention period in days | `15` |
| `prometheus.pvcSize` | PVC storage size | `10Gi` |
| `prometheus.storageClassName` | Storage class (empty = cluster default) | `""` |
| `prometheus.scrapeInterval` | Scrape interval for all targets | `15s` |
| `prometheus.resources.requests.memory` | Memory request | `512Mi` |
| `prometheus.resources.requests.cpu` | CPU request | `500m` |
| `prometheus.resources.limits.memory` | Memory limit | `512Mi` |
| `prometheus.resources.limits.cpu` | CPU limit | `500m` |
| `prometheus.httpPort` | HTTP listen port | `9090` |
| `prometheus.scrapeTargets.backendServices.host` | Backend-services service hostname | `backend-services` |
| `prometheus.scrapeTargets.backendServices.port` | Backend-services metrics port | `3002` |
| `prometheus.scrapeTargets.temporalServer.host` | Temporal server service hostname | `temporal` |
| `prometheus.scrapeTargets.temporalServer.port` | Temporal server metrics port | `9090` |

## Scrape Targets

Prometheus is pre-configured with two scrape targets:

### Backend-Services

Scrapes the `/metrics` endpoint exposed by the NestJS backend-services application. This endpoint provides RED (Rate, Errors, Duration) metrics and Node.js runtime metrics via `prom-client`. See `docs-md/PROMETHEUS_METRICS.md` for details on the metrics exposed.

### Temporal Server

Scrapes the Temporal server's built-in `/metrics` endpoint, which exposes workflow execution, task queue, and schedule metrics in Prometheus format. No custom instrumentation is required.

Both targets reference service names within the same Kubernetes namespace.

## Scrape Interval

The scrape interval defaults to `15s` and applies to all scrape targets. Override it via Helm values:

```bash
helm upgrade --install plg ./deployments/openshift/helm/plg \
  --set prometheus.scrapeInterval=30s
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
  --set prometheus.pvcSize=20Gi \
  --set prometheus.scrapeInterval=30s \
  --set prometheus.resources.limits.memory=1Gi
```

## Architecture Notes

- Prometheus runs as a single-replica StatefulSet.
- Metrics data is persisted to a PVC using the Prometheus TSDB storage engine.
- The existing Kustomize deployment for the application is not modified. PLG is a separate Helm release.
- Prometheus is not exposed via an OpenShift Route; access is via in-cluster services or port-forwarding.
- No Alertmanager configuration is included. Prometheus is used for metrics collection and querying only.
- Config changes trigger automatic pod restarts via the `checksum/config` annotation on the StatefulSet pod template.
