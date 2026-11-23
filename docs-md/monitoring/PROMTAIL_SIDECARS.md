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
| backend-services | Application logs via `tee` to emptyDir | `service=backend-services` | `/var/log/app/*.log` |
| temporal-worker | Worker logs via `tee` to emptyDir | `service=temporal-worker` | `/var/log/app/*.log` |
| temporal-server | Server logs via `tee` to emptyDir | `service=temporal-server` | `/var/log/app/*.log` |
| frontend | Nginx access/error logs written directly to emptyDir | `service=frontend` | `/var/log/app/*.log` |
| ches-adapter (PLG chart) | Adapter logs via `tee` to emptyDir | `service=ches-adapter` | `/var/log/app/*.log` |
| postgresql | PostgreSQL logging_collector output on pgdata volume | `service=postgresql` | `/pgdata/pg16/log/*.log` |

## Resource Limits

Every Promtail sidecar (backend-services, temporal-worker, temporal-server, frontend, and the PLG chart's ches-adapter) uses the same allocation:

| Resource | Request | Limit |
|----------|---------|-------|
| Memory | 64Mi | 128Mi |
| CPU | 50m | 100m |

128Mi is the smallest limit that leaves Promtail room to work. Promtail is a Go program, and Go lets its heap grow to about twice the live heap before it collects garbage. A sidecar here holds about 20 MiB live, so its heap peaks around 40–45 MiB in normal running. The Go runtime, goroutine stacks and the Promtail binary's own code pages, which the kernel charges to the container, come on top of that. Under a 64Mi limit that total reaches the limit. The kernel then makes room by evicting Promtail's code pages, which slows Promtail until its pushes to Loki time out, batches are dropped, and the container is OOMKilled. Loki backpressure raises the peak further: when Loki slows its ingest responses, Promtail holds the pending batches in its heap.

To adjust resource limits, modify the Promtail container resource specifications in the relevant deployment manifests under `deployments/openshift/kustomize/base/`, or in `deployments/openshift/helm/plg/templates/ches-adapter-deployment.yaml` for the ches-adapter.

## Configuration

Each service has its own Promtail ConfigMap containing the Promtail configuration:

- `backend-services-promtail` - backend-services Promtail config
- `temporal-worker-promtail` - temporal-worker Promtail config
- `temporal-server-promtail` - temporal-server Promtail config
- `frontend-promtail` - frontend Promtail config
- `<instance>-plg-ches-adapter-promtail` - ches-adapter Promtail config (PLG Helm chart)
- `postgresql-promtail` - PostgreSQL Promtail config

### Promtail Configuration Structure

Each ConfigMap contains a `promtail.yaml` with:

- **server**: HTTP and gRPC listen ports disabled (set to 0) since only log forwarding is needed
- **positions**: Tracks how far Promtail has read each log in `/var/lib/promtail/positions.yaml`, on a per-pod `emptyDir` named `promtail-positions`. The volume outlives a Promtail container restart, so the restarted container resumes where it stopped. A file in the container's own filesystem (such as `/tmp`) is discarded with the container; Promtail would then read every log from the beginning and send it to Loki again, stamped with the restart time.
- **clients**: Points to the Loki push API endpoint using in-namespace service DNS
- **scrape_configs**: Defines the job name, service label, and log file path glob pattern

### Loki Endpoint

All Promtail sidecars are configured to push logs to `http://loki:3100/loki/api/v1/push`. This uses the in-namespace Kubernetes service DNS name for the Loki instance deployed via the PLG Helm chart.

## Shared Volume Patterns

### emptyDir (all application services)

Every application service shares its log file with Promtail through an ephemeral `emptyDir` mounted at `/var/log/app/`, one per pod. Logs are not persisted across pod restarts, and do not need to be: Promtail forwards them to Loki in near real-time, and Loki is the durable copy.

A `ReadWriteMany` PVC must not be used here. It was, for backend-services and temporal-worker, and it corrupted the logs: every replica appends to one file over NFS, which has no atomic append, so each replica writes at the end-of-file its own client has cached — overwriting other replicas' lines and zero-filling the gaps between them. It also meant every replica's Promtail tailed the same file and shipped each line once per replica.

Services carrying a log file also run a `log-rotator` sidecar that truncates it past 10 MB, so an ephemeral volume cannot grow into the node's disk. See [LOGGING.md](LOGGING.md).

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
- `deployments/openshift/kustomize/base/frontend/deployment.yml` - Added logs volume and Promtail sidecar
- `deployments/openshift/kustomize/base/frontend/promtail-configmap.yml` - New Promtail ConfigMap
- `deployments/openshift/kustomize/base/frontend/kustomization.yml` - Added promtail-configmap.yml resource
- `deployments/openshift/kustomize/base/crunchydb/postgrescluster.yml` - Added Promtail sidecar container, config volume, and PostgreSQL logging parameters
- `deployments/openshift/kustomize/base/crunchydb/promtail-configmap.yml` - New Promtail ConfigMap
- `deployments/openshift/kustomize/base/crunchydb/kustomization.yml` - Added promtail-configmap.yml resource
