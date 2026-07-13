# Local PLG Monitoring Stack

The project includes an opt-in PLG (Prometheus, Loki, Grafana) monitoring stack for local development, plus Alertmanager and a CHES email adapter for alert notifications (see [ALERTING.md](ALERTING.md)). It runs alongside the core Docker Compose services (PostgreSQL, MinIO — `--profile infra`) without affecting them.

## Quick Start

Generate the Prometheus alert rules (the output file is gitignored, so run this before first start and after changing `deployments/alert-thresholds.ts`), then start the monitoring stack:

```bash
npm run generate:alert-rules
docker compose --profile monitoring up -d
```

The repo also provides podman-based convenience scripts that generate alert rules and start the monitoring profile together with the other profiles: `npm run pod:base` (infra + temporal + monitoring) and `npm run pod:all` (everything).

Stop the monitoring stack:

```bash
docker compose --profile monitoring down
```

View monitoring container logs:

```bash
docker compose --profile monitoring logs -f
```

## Services and Ports

| Service      | URL                    | Description                              |
|--------------|------------------------|------------------------------------------|
| Grafana      | http://localhost:3001   | Dashboards and log/metric exploration    |
| Prometheus   | http://localhost:9090   | Metrics storage and querying             |
| Loki         | http://localhost:3100   | Log aggregation                          |
| Alertmanager | http://localhost:9093   | Alert routing, deduplication, silencing  |
| ches-adapter | http://localhost:3003   | Alertmanager webhook → CHES email        |

## Default Credentials

- **Grafana**: `admin` / `admin` (override via `GRAFANA_ADMIN_USER` and `GRAFANA_ADMIN_PASSWORD` environment variables)

## Collecting Host Process Logs

Promtail collects logs from processes running on your host (backend-services, frontend, temporal-worker) via the standard dev scripts:

```bash
# Run backend with logs sent to Loki
npm run dev:backend

# Run frontend with logs sent to Loki
npm run dev:frontend

# Run temporal worker with logs sent to Loki
npm run dev:temporal-worker

# Run all three with logs sent to Loki
npm run dev
```

These scripts tee process output to `logs/` directory files (`backend-services.log`, `frontend.log`, `temporal-worker.log`), which Promtail watches and forwards to Loki. You still see all output in your terminal as normal.

The logs appear in Grafana under the `backend-services`, `frontend`, and `temporal-worker` service labels (same as they would in OpenShift).

## Architecture

### Components

- **Loki** (grafana/loki:3.4.0) - Receives and stores logs. Configured with filesystem storage and 30-day retention.
- **Promtail** (grafana/promtail:3.4.0) - Tails the host process log files under `logs/` (mounted at `/var/log/host-apps`) and the ches-adapter log volume, and forwards them to Loki with `service` and `project` labels.
- **Alertmanager** (prom/alertmanager:v0.28.1) - Receives alerts fired by Prometheus rules and routes them to the ches-adapter webhook. See [ALERTING.md](ALERTING.md).
- **ches-adapter** - Built from `apps/ches-adapter`; translates Alertmanager webhook payloads into CHES email. Requires `CHES_*` environment variables (see `docker-compose.yml`).
- **Prometheus** (prom/prometheus:v3.2.1) - Scrapes metrics from backend-services (`host.containers.internal:3002/metrics`) and the Temporal worker (`host.containers.internal:9091/metrics`), and evaluates alert rules from `deployments/local/prometheus/rules/`. Data is retained for 15 days.
- **Grafana** (grafana/grafana:11.5.2) - Pre-configured with Prometheus and Loki data sources and pre-built dashboards.

### Data Persistence

Loki, Prometheus, Grafana, and Alertmanager data is stored in named Docker volumes (`loki_data`, `prometheus_data`, `grafana_data`, `alertmanager_data`). Data survives container restarts and `docker compose down`. To clear all monitoring data:

```bash
docker compose --profile monitoring down -v
```

### Log Collection

Promtail tails a static set of log files (no Docker socket access is needed). It applies the following labels to each log stream:

- `service` - The originating service (`backend-services`, `frontend`, `temporal-worker`, or `ches-adapter`)
- `project` - `host` for host process logs, `monitoring` for the ches-adapter container log

### Grafana Data Sources

Grafana is provisioned with two data sources on startup:

- **Prometheus** (default) - Points to the local Prometheus instance
- **Loki** - Points to the local Loki instance

Dashboards are provisioned from the shared OpenShift Helm chart directory (`deployments/openshift/helm/plg/dashboards`): application-overview, logs-explorer, and nodejs-runtime.

No manual configuration is required.

## Configuration Files

| File                                                          | Purpose                       |
|---------------------------------------------------------------|-------------------------------|
| `docker-compose.yml` (`--profile monitoring`)                 | Monitoring service definitions |
| `deployments/local/loki/loki.yaml`                            | Loki server configuration     |
| `deployments/local/prometheus/prometheus.yml`                  | Prometheus scrape targets and Alertmanager wiring |
| `deployments/local/prometheus/rules/` (generated by `npm run generate:alert-rules`) | Prometheus alert rules |
| `deployments/local/promtail/promtail-config.yml`              | Promtail log file scrape config |
| `deployments/local/alertmanager/alertmanager.yml`             | Alertmanager routing configuration |
| `deployments/local/grafana/provisioning/datasources/datasources.yml` | Grafana data source provisioning |
| `deployments/local/grafana/provisioning/dashboards/dashboards.yml` | Grafana dashboard provisioning |

## VS Code Integration

Two VS Code tasks are available:

- **monitoring: docker up** - Starts the monitoring stack
- **Dev: all + monitoring** - Starts the full development environment including the monitoring stack

The existing **Dev: all** task is unchanged and does not include monitoring.
