# Local PLG Monitoring Stack

The project includes an opt-in PLG (Prometheus, Loki, Grafana) monitoring stack for local development. It runs alongside the core Docker Compose services (PostgreSQL, MinIO) without affecting them.

## Quick Start

Start the monitoring stack:

```bash
npm run dev:monitoring
```

Or start it alongside the core stack:

```bash
docker compose -f apps/backend-services/docker-compose.yml -f docker-compose.monitoring.yml up -d
```

Stop the monitoring stack:

```bash
npm run dev:monitoring:down
```

View monitoring container logs:

```bash
npm run dev:monitoring:logs
```

## Services and Ports

| Service    | URL                    | Description                              |
|------------|------------------------|------------------------------------------|
| Grafana    | http://localhost:3001   | Dashboards and log/metric exploration    |
| Prometheus | http://localhost:9090   | Metrics storage and querying             |
| Loki       | http://localhost:3100   | Log aggregation                          |

## Default Credentials

- **Grafana**: `admin` / `admin` (override via `GRAFANA_ADMIN_USER` and `GRAFANA_ADMIN_PASSWORD` environment variables)

## Architecture

### Components

- **Loki** (grafana/loki:3.4.0) - Receives and stores logs. Configured with filesystem storage and 30-day retention.
- **Promtail** (grafana/promtail:3.4.0) - Discovers running Docker containers via the Docker socket and forwards their stdout logs to Loki. Adds `service`, `container`, and `project` labels automatically.
- **Prometheus** (prom/prometheus:v3.2.1) - Scrapes metrics from backend-services (`host.docker.internal:3002/metrics`) and the Temporal server (`temporal:9090/metrics`). Data is retained for 15 days.
- **Grafana** (grafana/grafana:11.5.2) - Pre-configured with Prometheus and Loki data sources for querying metrics and logs.

### Data Persistence

Loki and Prometheus data is stored in named Docker volumes (`loki_data` and `prometheus_data`). Data survives container restarts and `docker compose down`. To clear all monitoring data:

```bash
docker compose -f docker-compose.monitoring.yml down -v
```

### Log Collection

Promtail auto-discovers all running Docker containers by mounting `/var/run/docker.sock`. It applies the following labels to each log stream:

- `container` - The Docker container name
- `service` - The Docker Compose service name
- `project` - The Docker Compose project name

### Grafana Data Sources

Grafana is provisioned with two data sources on startup:

- **Prometheus** (default) - Points to the local Prometheus instance
- **Loki** - Points to the local Loki instance

No manual configuration is required.

## Configuration Files

| File                                                          | Purpose                       |
|---------------------------------------------------------------|-------------------------------|
| `docker-compose.monitoring.yml`                               | Docker Compose service definitions |
| `deployments/local/loki/loki.yaml`                            | Loki server configuration     |
| `deployments/local/prometheus/prometheus.yml`                  | Prometheus scrape targets      |
| `deployments/local/promtail/promtail-config.yml`              | Promtail log discovery rules   |
| `deployments/local/grafana/provisioning/datasources/datasources.yml` | Grafana data source provisioning |

## VS Code Integration

Two VS Code tasks are available:

- **monitoring: docker up** - Starts the monitoring stack
- **Dev: all + monitoring** - Starts the full development environment including the monitoring stack

The existing **Dev: all** task is unchanged and does not include monitoring.
