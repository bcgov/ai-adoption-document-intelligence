# Promtail Sidecar Containers

Promtail sidecar containers are added to all application pods on OpenShift to collect logs and forward them to Loki. This sidecar pattern works within tenant-level namespace permissions without requiring cluster-admin access or DaemonSet deployments.

## Architecture

Each application pod includes a Promtail sidecar container that:

1. Tails log files from a shared volume within the pod
2. Forwards log entries to the in-namespace Loki service at `http://loki:3100/loki/api/v1/push`
3. Adds a `service` label to all log entries for filtering in Grafana

## Services with Promtail Sidecars

| Service | Log Source | Service Label | Log Path |
|---------|-----------|---------------|----------|
| backend-services | Application logs via `tee` to shared PVC | `service=backend-services` | `/var/log/app/*.log` |
| temporal-worker | Worker logs via `tee` to shared PVC | `service=temporal-worker` | `/var/log/app/*.log` |
| temporal-server | Server logs via `tee` to emptyDir | `service=temporal-server` | `/var/log/app/*.log` |
| frontend | Nginx access/error logs via symlinks to emptyDir | `service=frontend` | `/var/log/app/*.log` |
| postgresql | PostgreSQL logging_collector output on pgdata volume | `service=postgresql` | `/pgdata/pg16/log/*.log` |

## Resource Limits

All Promtail sidecars use minimal resource allocations:

| Resource | Request | Limit |
|----------|---------|-------|
| Memory | 32Mi | 64Mi |
| CPU | 50m | 100m |

These defaults are sized for low-traffic environments. To adjust resource limits, modify the Promtail container resource specifications in the relevant deployment manifests under `deployments/openshift/kustomize/base/`.

## Configuration

Each service has its own Promtail ConfigMap containing the Promtail configuration:

- `backend-services-promtail` - backend-services Promtail config
- `temporal-worker-promtail` - temporal-worker Promtail config
- `temporal-server-promtail` - temporal-server Promtail config
- `frontend-promtail` - frontend Promtail config
- `postgresql-promtail` - PostgreSQL Promtail config

### Promtail Configuration Structure

Each ConfigMap contains a `promtail.yaml` with:

- **server**: HTTP and gRPC listen ports disabled (set to 0) since only log forwarding is needed
- **positions**: Tracks read positions in `/tmp/positions.yaml` within the container
- **clients**: Points to the Loki push API endpoint using in-namespace service DNS
- **scrape_configs**: Defines the job name, service label, and log file path glob pattern

### Loki Endpoint

All Promtail sidecars are configured to push logs to `http://loki:3100/loki/api/v1/push`. This uses the in-namespace Kubernetes service DNS name for the Loki instance deployed via the PLG Helm chart.

## Shared Volume Patterns

### PVC-backed (backend-services, temporal-worker)

These services already had a logrotate sidecar writing to `/var/log/app/` on a PersistentVolumeClaim. The Promtail sidecar mounts the same PVC volume in read-only mode.

### emptyDir (temporal-server, frontend)

These services use ephemeral `emptyDir` volumes for log sharing. Logs are not persisted across pod restarts, but Promtail forwards them to Loki in near real-time.

### pgdata volume (PostgreSQL)

The Crunchy PostgreSQL operator manages the data volume. PostgreSQL's `logging_collector` writes logs to the `log/` subdirectory within the pgdata path. The Promtail sidecar reads from `/pgdata/pg16/log/*.log`.

## Log Collection Flow

```
Application Container
    |
    | writes logs to shared volume
    v
Shared Volume (/var/log/app/ or /pgdata/pg16/log/)
    |
    | Promtail tails log files
    v
Promtail Sidecar
    |
    | HTTP POST to Loki push API
    v
Loki (http://loki:3100)
```

## Promtail Image

All sidecars use `grafana/promtail:3.4.2`. To update the Promtail version, change the image tag in each deployment manifest.

## Files Modified

- `deployments/openshift/kustomize/base/backend-services/deployment.yml` - Added Promtail sidecar container and config volume
- `deployments/openshift/kustomize/base/backend-services/promtail-configmap.yml` - New Promtail ConfigMap
- `deployments/openshift/kustomize/base/backend-services/kustomization.yml` - Added promtail-configmap.yml resource
- `deployments/openshift/kustomize/base/temporal/temporal-worker-deployment.yml` - Added Promtail sidecar container and config volume
- `deployments/openshift/kustomize/base/temporal/promtail-configmap-worker.yml` - New Promtail ConfigMap for worker
- `deployments/openshift/kustomize/base/temporal/temporal-server-deployment.yml` - Added log output redirection, logs volume, and Promtail sidecar
- `deployments/openshift/kustomize/base/temporal/promtail-configmap-server.yml` - New Promtail ConfigMap for server
- `deployments/openshift/kustomize/base/temporal/kustomization.yml` - Added promtail configmap resources
- `deployments/openshift/kustomize/base/frontend/deployment.yml` - Added nginx log redirection, logs volume, and Promtail sidecar
- `deployments/openshift/kustomize/base/frontend/promtail-configmap.yml` - New Promtail ConfigMap
- `deployments/openshift/kustomize/base/frontend/kustomization.yml` - Added promtail-configmap.yml resource
- `deployments/openshift/kustomize/base/crunchydb/postgrescluster.yml` - Added Promtail sidecar container, config volume, and PostgreSQL logging parameters
- `deployments/openshift/kustomize/base/crunchydb/promtail-configmap.yml` - New Promtail ConfigMap
- `deployments/openshift/kustomize/base/crunchydb/kustomization.yml` - Added promtail-configmap.yml resource
