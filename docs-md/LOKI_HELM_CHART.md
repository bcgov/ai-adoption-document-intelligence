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
    grafana-configmap.yaml           # Grafana server configuration
    grafana-datasources-configmap.yaml # Pre-provisioned data sources
    grafana-deployment.yaml          # Grafana Deployment
    grafana-service.yaml             # ClusterIP Service for Grafana
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
| `loki.resources.limits.memory` | Memory limit | `256Mi` (OpenShift override: `2Gi`) |
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

The compactor writes temporary marker files under `/tmp` during retention processing. The Loki StatefulSet mounts a writable `emptyDir` at `/tmp` because the container runs with `readOnlyRootFilesystem: true`; without that mount, retention fails with `read-only file system` errors and log data is never purged.

| Setting | Value | Purpose |
|---------|-------|---------|
| `compaction_interval` | 10m | How often the compactor runs |
| `retention_delete_delay` | 2h | Grace period before marked chunks are deleted |
| `retention_delete_worker_count` | 20 | Parallel delete workers (lower value reduces memory spikes) |

To change the retention period, override `loki.retentionDays`:

```bash
helm upgrade plg ./deployments/openshift/helm/plg --set loki.retentionDays=14
```

## Ingestion Rate Limits

The OpenShift deployment configures ingestion limits to apply back-pressure before Loki exhausts its memory ceiling:

| Setting | Value | Purpose |
|---------|-------|---------|
| `ingestion_rate_mb` | 4 | Sustained ingest rate per tenant (MB/s) |
| `ingestion_burst_size_mb` | 8 | Burst allowance above the sustained rate |
| `chunk_idle_period` | 5m | Flush idle chunks to disk after this interval |
| `chunk_target_size` | 1536000 (~1.5MB) | Flush a chunk to disk once it reaches this size |

Without these limits, Loki accumulates unbounded in-memory chunks when ingestion outpaces disk flushes, eventually reaching the memory ceiling and being OOMKilled. The ingestion limits cause Promtail to receive a `429 Too Many Requests` response and retry, rather than Loki silently growing until it is killed.

## Prometheus Metrics

Loki exposes a `/metrics` endpoint on its HTTP port. The PLG Prometheus instance scrapes it via a dedicated `loki` scrape job configured in `prometheus-configmap.yaml`. Use `{job="loki"}` as the label selector in queries, for example:

```promql
# Current RSS memory usage
process_resident_memory_bytes{job="loki"}

# In-memory ingester chunks
loki_ingester_memory_chunks

# Ingest rate (bytes/sec)
rate(loki_distributor_bytes_received_total[5m])
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
- The container uses `readOnlyRootFilesystem: true` with writable mounts at `/loki` (PVC) and `/tmp` (`emptyDir`).
- Data is persisted to a PVC using the TSDB store with filesystem object storage.
- The existing Kustomize deployment for the application is not modified. PLG is a separate Helm release.
- Loki is not exposed via an OpenShift Route; access is via in-cluster services or port-forwarding.
- Log collection is handled by Promtail (configured separately) which sends logs to Loki's push API.
